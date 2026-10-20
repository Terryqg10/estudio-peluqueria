-- T-005c: límites antiabuso de la reserva (ADR-0020, RF-10, CA-29).
-- - Por email: máximo de citas ACTIVAS (se cuentan en `appointments`; cancelar libera).
-- - Por IP: máximo de reservas CREADAS en una ventana (tabla `rate_limits`, IP solo como hash con
--   sal de servidor y caducidad en horas: spec, sección 9).
-- Se aplican dentro de `create_booking`, en la misma transacción y con bloqueo, para que dos
-- peticiones simultáneas no superen el máximo (ADR-0015).

create table public.rate_limits (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('ip')),
  key_hash text not null check (char_length(key_hash) between 32 and 128),
  created_at timestamptz not null default now()
);

create index rate_limits_lookup_idx on public.rate_limits (kind, key_hash, created_at);
create index rate_limits_created_idx on public.rate_limits (created_at);

-- Sin políticas: nadie con clave anónima o de usuario puede leer ni escribir. Solo la usan las
-- funciones `security definer` y `service_role`.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, delete on public.rate_limits to service_role;

-- La firma cambia (parámetros nuevos con valores por defecto): se sustituye la función.
drop function public.create_booking(uuid, uuid, timestamptz, text, text, text, text);

create function public.create_booking(
  p_service_id uuid,
  p_stylist_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_consent_version text,
  p_ip_hash text default null,
  p_max_active_per_email integer default 3,
  p_max_per_ip integer default 10,
  p_ip_window_minutes integer default 60
)
returns table (appointment_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_guest_name, ''));
  v_email text := lower(btrim(coalesce(p_guest_email, '')));
  v_phone text := btrim(coalesce(p_guest_phone, ''));
  v_consent text := btrim(coalesce(p_consent_version, ''));
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_duration integer;
  v_ends timestamptz;
  v_id uuid;
begin
  -- Entrada: se valida también aquí (defensa en profundidad; la app ya valida con Zod).
  if char_length(v_name) < 2 or char_length(v_name) > 80
     or char_length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or v_phone !~ '^\+?[0-9(][0-9 ()-]{7,18}[0-9]$'
     or v_consent = '' or char_length(v_consent) > 40
     or p_service_id is null or p_stylist_id is null or p_starts_at is null
     or (v_ip is not null and char_length(v_ip) not between 32 and 128)
     or p_max_active_per_email < 1 or p_max_per_ip < 1 or p_ip_window_minutes < 1 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Límites (RF-10, CA-29). Los bloqueos serializan las peticiones de la misma persona: sin ellos,
  -- dos a la vez podrían pasar ambas la comprobación. Siempre en el mismo orden (IP, email).
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('booking-ip:' || v_ip, 0));
    if (
      select count(*)
      from public.rate_limits r
      where r.kind = 'ip'
        and r.key_hash = v_ip
        and r.created_at > now() - make_interval(mins => p_ip_window_minutes)
    ) >= p_max_per_ip then
      raise exception 'LIMIT_IP';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-email:' || v_email, 0));
  -- Activa = pendiente o confirmada y aún no terminada. Canceladas, pasadas, completadas y no
  -- asistidas no cuentan.
  if (
    select count(*)
    from public.appointments a
    where a.guest_email = v_email
      and a.status in ('pending', 'confirmed')
      and upper(a.during) > now()
  ) >= p_max_active_per_email then
    raise exception 'LIMIT_EMAIL';
  end if;

  -- Servicio activo y estilista activa que lo hace (ADR-0014).
  select duration_min into v_duration
  from public.services
  where id = p_service_id and active;

  if v_duration is null
     or not exists (
       select 1
       from public.stylists st
       join public.stylist_services ss on ss.stylist_id = st.id
       where st.id = p_stylist_id and st.active and ss.service_id = p_service_id
     ) then
    raise exception 'INVALID_SELECTION';
  end if;

  -- Ventana de reserva (VERIFICAR con el salón): desde ahora + 2 h hasta + 60 días.
  if p_starts_at < now() + interval '2 hours' or p_starts_at > now() + interval '60 days' then
    raise exception 'OUT_OF_WINDOW';
  end if;

  -- El hueco debe estar ofrecido por get_availability: una sola fuente de verdad para
  -- horarios, bloqueos, rejilla de 15 min y ventana (ADR-0013).
  if not exists (
    select 1
    from public.get_availability(
      p_service_id,
      (p_starts_at at time zone 'Europe/Madrid')::date,
      p_stylist_id
    ) g
    where g.starts_at = p_starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_duration);

  -- La restricción de exclusión es la árbitra de la carrera (CA-08, CA-09): si otra petición
  -- ocupó el hueco entre la comprobación y la inserción, esta falla y se traduce a SLOT_TAKEN.
  begin
    insert into public.appointments (
      stylist_id, service_id, during, status,
      guest_name, guest_email, guest_phone,
      consent_at, consent_version
    )
    values (
      p_stylist_id, p_service_id, tstzrange(p_starts_at, v_ends, '[)'), 'confirmed',
      v_name, v_email, v_phone,
      now(), v_consent
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  -- Solo una reserva creada consume cupo de IP. Caducidad: los registros de más de dos ventanas
  -- se borran al escribir (sin tarea programada todavía; T-013).
  if v_ip is not null then
    insert into public.rate_limits (kind, key_hash) values ('ip', v_ip);
    delete from public.rate_limits r
    where r.created_at < now() - make_interval(mins => p_ip_window_minutes * 2);
  end if;

  return query select v_id, p_starts_at, v_ends;
end;
$$;

revoke all on function public.create_booking(
  uuid, uuid, timestamptz, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.create_booking(
  uuid, uuid, timestamptz, text, text, text, text, text, integer, integer, integer
) to service_role;

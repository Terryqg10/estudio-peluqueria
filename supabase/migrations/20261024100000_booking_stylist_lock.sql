-- T-015: evita el deadlock de create_booking y de reschedule_guest_appointment con peticiones
-- simultáneas al mismo hueco (ADR-0024, supera un punto de ADR-0015).
--
-- Medido (2026-10-21): con 6 reservas simultáneas al mismo hueco, una se creaba y las otras 5 recibían
-- 40P01 «deadlock detected» tras 3-5 s en vez de SLOT_TAKEN; la reprogramación llegaba a no aplicar
-- ninguna. Ambas funciones se reemplazan SIN cambiar firma, permisos ni resultados: solo añaden un
-- pg_advisory_xact_lock por estilista antes de comprobar disponibilidad y escribir. `create or replace`
-- conserva los `grant` y `revoke` existentes (create_booking solo service_role; la reprogramación,
-- anon y authenticated, como en T-006c).

create or replace function public.create_booking(
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

  -- Serializa por estilista (ADR-0024): sin esto, varias peticiones al mismo hueco pasan a la vez la
  -- comprobación de disponibilidad e insertan a la vez contra la restricción de exclusión, y con 3 o más
  -- PostgreSQL lo resuelve como deadlock (40P01) en vez de exclusion_violation. Orden de bloqueos:
  -- IP -> email -> estilista. Es de transacción: se libera al confirmar o al fallar.
  perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || p_stylist_id::text, 0));

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

create or replace function public.reschedule_guest_appointment(
  p_token text,
  p_stylist_id uuid,
  p_starts_at timestamptz
)
returns table (id uuid, stylist_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_service uuid;
  v_status public.appointment_status;
  v_old_stylist uuid;
  v_old_start timestamptz;
  v_duration integer;
  v_ends timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select a.id, a.service_id, a.status, a.stylist_id, lower(a.during)
    into v_id, v_service, v_status, v_old_stylist, v_old_start
  from public.appointment_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
  for update of a;

  if v_id is null or v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_TOKEN';
  end if;

  -- TOO_LATE solo se emite después de validar el token. Cuenta la cita ORIGINAL (RF-05).
  if v_old_start - now() < interval '24 hours' then
    raise exception 'TOO_LATE';
  end if;

  if p_stylist_id is null or p_starts_at is null then
    raise exception 'INVALID_INPUT';
  end if;

  -- El servicio no cambia: la duración es la de la cita (aunque el servicio se haya desactivado).
  select s.duration_min into v_duration from public.services s where s.id = v_service;

  if v_duration is null
     or not exists (
       select 1
       from public.stylists st
       join public.stylist_services ss on ss.stylist_id = st.id
       where st.id = p_stylist_id and st.active and ss.service_id = v_service
     ) then
    raise exception 'INVALID_SELECTION';
  end if;

  if p_starts_at < now() + interval '2 hours' or p_starts_at > now() + interval '60 days' then
    raise exception 'OUT_OF_WINDOW';
  end if;

  if p_stylist_id = v_old_stylist and p_starts_at = v_old_start then
    raise exception 'NO_CHANGE';
  end if;

  -- Serializa por estilista (ADR-0024). Se toma DESPUÉS de validar el token (si no, una persona anónima con
  -- tokens inválidos podría mantener bloqueada a una estilista) y tras bloquear la fila de la cita. Se
  -- bloquean la estilista nueva y, si cambia, también la antigua, SIEMPRE por orden de id: así dos cambios
  -- que se cruzan (X de A a B e Y de B a A) no pueden esperarse en círculo.
  if v_old_stylist = p_stylist_id then
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || p_stylist_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || least(v_old_stylist, p_stylist_id)::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || greatest(v_old_stylist, p_stylist_id)::text, 0));
  end if;

  -- El hueco debe estar ofrecido por el mismo cálculo que la reserva, ignorando esta cita.
  if not exists (
    select 1
    from public.availability_core(
      v_service,
      (p_starts_at at time zone 'Europe/Madrid')::date,
      p_stylist_id,
      v_id
    ) g
    where g.starts_at = p_starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_duration);

  begin
    update public.appointments a
    set stylist_id = p_stylist_id,
        during = tstzrange(p_starts_at, v_ends, '[)'),
        updated_at = now()
    where a.id = v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  -- El mismo enlace sigue valiendo: su caducidad pasa al nuevo inicio (ADR-0009, ADR-0019).
  update public.appointment_tokens t
  set expires_at = p_starts_at
  where t.appointment_id = v_id;

  return query select v_id, p_stylist_id, p_starts_at, v_ends;
end;
$$;

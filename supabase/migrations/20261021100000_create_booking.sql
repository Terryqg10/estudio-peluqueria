-- T-005b: creación transaccional de la reserva de invitada (ADR-0015).
-- Solo service_role puede ejecutarla: la única puerta de entrada es la acción de servidor,
-- donde se aplican Zod, honeypot y (T-005c) límites. No emite el token de gestión (T-006).

create function public.create_booking(
  p_service_id uuid,
  p_stylist_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_consent_version text
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
     or p_service_id is null or p_stylist_id is null or p_starts_at is null then
    raise exception 'INVALID_INPUT';
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

  return query select v_id, p_starts_at, v_ends;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text)
  to service_role;

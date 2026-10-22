-- T-008c: el Admin mueve y cancela citas (ADR-0026, RF-06, CA-16).
-- Tres funciones security definer que exigen is_admin() (ADR-0022) y reutilizan availability_core
-- y el bloqueo por estilista (ADR-0024). No aplican la ventana de 24 h de la clienta (RF-05).

-- Huecos para mover la cita, sin contarla a ella. Solo Admin.
create function public.admin_appointment_availability(p_appointment_id uuid, p_date date)
returns table (stylist_id uuid, starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service uuid;
  v_status public.appointment_status;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_appointment_id is null or p_date is null then
    raise exception 'INVALID_INPUT';
  end if;

  select a.service_id, a.status into v_service, v_status
  from public.appointments a
  where a.id = p_appointment_id;

  if v_service is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_STATE';
  end if;

  return query
  select c.stylist_id, c.starts_at
  from public.availability_core(v_service, p_date, null, p_appointment_id) c;
end;
$$;

create function public.admin_reschedule_appointment(
  p_appointment_id uuid,
  p_stylist_id uuid,
  p_starts_at timestamptz
)
returns table (id uuid, stylist_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service uuid;
  v_status public.appointment_status;
  v_old_stylist uuid;
  v_old_start timestamptz;
  v_duration integer;
  v_ends timestamptz;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_appointment_id is null or p_stylist_id is null or p_starts_at is null then
    raise exception 'INVALID_INPUT';
  end if;

  select a.service_id, a.status, a.stylist_id, lower(a.during)
    into v_service, v_status, v_old_stylist, v_old_start
  from public.appointments a
  where a.id = p_appointment_id
  for update of a;

  if v_service is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_STATE';
  end if;

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

  if p_stylist_id = v_old_stylist and p_starts_at = v_old_start then
    raise exception 'NO_CHANGE';
  end if;

  -- Bloqueo por estilista siempre en orden de id (ADR-0024).
  if v_old_stylist = p_stylist_id then
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || p_stylist_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || least(v_old_stylist, p_stylist_id)::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || greatest(v_old_stylist, p_stylist_id)::text, 0));
  end if;

  if not exists (
    select 1
    from public.availability_core(
      v_service,
      (p_starts_at at time zone 'Europe/Madrid')::date,
      p_stylist_id,
      p_appointment_id
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
    where a.id = p_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  -- El enlace de la clienta sigue valiendo y caduca al nuevo inicio (ADR-0009, ADR-0019).
  update public.appointment_tokens t
  set expires_at = p_starts_at
  where t.appointment_id = p_appointment_id;

  return query select p_appointment_id, p_stylist_id, p_starts_at, v_ends;
end;
$$;

create function public.admin_cancel_appointment(p_appointment_id uuid)
returns table (id uuid, status public.appointment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.appointment_status;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_appointment_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  select a.status into v_status
  from public.appointments a
  where a.id = p_appointment_id
  for update of a;

  if v_status is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_STATE';
  end if;

  update public.appointments a
  set status = 'cancelled', updated_at = now()
  where a.id = p_appointment_id;

  return query select p_appointment_id, 'cancelled'::public.appointment_status;
end;
$$;

revoke all on function public.admin_appointment_availability(uuid, date) from public, anon, authenticated;
revoke all on function public.admin_reschedule_appointment(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_cancel_appointment(uuid) from public, anon, authenticated;
grant execute on function public.admin_appointment_availability(uuid, date) to authenticated;
grant execute on function public.admin_reschedule_appointment(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.admin_cancel_appointment(uuid) to authenticated;

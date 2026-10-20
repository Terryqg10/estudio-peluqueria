-- T-006c: cambiar la cita desde el enlace (ADR-0019).
-- 1. availability_core: el cálculo de get_availability con un parámetro para ignorar UNA cita
--    (la que se está moviendo, para que no choque consigo misma). No es invocable por anon.
-- 2. get_availability pasa a ser una envoltura con la misma firma y el mismo comportamiento.
-- 3. get_guest_reschedule_availability(token, día): huecos libres para mover esa cita.
-- 4. reschedule_guest_appointment(token, estilista, inicio): mueve la MISMA cita (conserva id y
--    token) y actualiza la caducidad del token al nuevo inicio.

create function public.availability_core(
  p_service_id uuid,
  p_date date,
  p_stylist_id uuid,
  p_exclude_appointment uuid
)
returns table (stylist_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with svc as (
    select duration_min
    from public.services
    where id = p_service_id and active
  ),
  -- Tramos del día: horario de la estilista ∩ horario del salón, en hora local.
  windows as (
    select
      ss.stylist_id,
      (p_date + greatest(ss.starts, sh.opens)) at time zone 'Europe/Madrid' as window_start,
      (p_date + least(ss.ends, sh.closes)) at time zone 'Europe/Madrid' as window_end
    from public.stylist_schedule ss
    join public.salon_hours sh on sh.weekday = ss.weekday
    join public.stylists st on st.id = ss.stylist_id and st.active
    where ss.weekday = extract(isodow from p_date)::int
      and greatest(ss.starts, sh.opens) < least(ss.ends, sh.closes)
      and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
      and exists (
        select 1
        from public.stylist_services x
        where x.stylist_id = ss.stylist_id and x.service_id = p_service_id
      )
  ),
  candidates as (
    select
      w.stylist_id,
      g as cand_start,
      g + make_interval(mins => svc.duration_min) as cand_end
    from windows w
    cross join svc
    cross join lateral generate_series(
      w.window_start,
      w.window_end - make_interval(mins => svc.duration_min),
      interval '15 minutes'
    ) as g
  )
  select distinct c.stylist_id, c.cand_start
  from candidates c
  where
    -- Ventana de reserva (VERIFICAR con el salón): desde ahora + 2 h hasta + 60 días.
    c.cand_start >= now() + interval '2 hours'
    and c.cand_start <= now() + interval '60 days'
    -- Sin solape con citas activas (las canceladas no bloquean). La cita excluida no cuenta.
    and not exists (
      select 1
      from public.appointments a
      where a.stylist_id = c.stylist_id
        and a.status <> 'cancelled'
        and a.id is distinct from p_exclude_appointment
        and a.during && tstzrange(c.cand_start, c.cand_end, '[)')
    )
    -- Sin solape con vacaciones, descansos ni bloqueos.
    and not exists (
      select 1
      from public.time_blocks t
      where t.stylist_id = c.stylist_id
        and t.during && tstzrange(c.cand_start, c.cand_end, '[)')
    )
  order by c.cand_start, c.stylist_id;
$$;

-- Solo la usan otras funciones security definer y service_role: pasar un id de cita a mano
-- permitiría sondear citas ajenas.
revoke all on function public.availability_core(uuid, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.availability_core(uuid, date, uuid, uuid) to service_role;

-- get_availability conserva firma, permisos y resultado (T-004): ahora delega en el núcleo.
create or replace function public.get_availability(
  p_service_id uuid,
  p_date date,
  p_stylist_id uuid default null
)
returns table (stylist_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.availability_core(p_service_id, p_date, p_stylist_id, null);
$$;

-- Huecos libres para mover la cita del token: los de su servicio, de cualquier estilista que lo
-- haga, sin contar la propia cita. Mismo error genérico que el resto de funciones del token.
create function public.get_guest_reschedule_availability(p_token text, p_date date)
returns table (stylist_id uuid, starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_service uuid;
  v_status public.appointment_status;
  v_start timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' or p_date is null then
    raise exception 'INVALID_TOKEN';
  end if;

  select a.id, a.service_id, a.status, lower(a.during)
    into v_id, v_service, v_status, v_start
  from public.appointment_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now();

  if v_id is null or v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_TOKEN';
  end if;

  if v_start - now() < interval '24 hours' then
    raise exception 'TOO_LATE';
  end if;

  return query
  select c.stylist_id, c.starts_at
  from public.availability_core(v_service, p_date, null, v_id) c;
end;
$$;

-- Cambio de la cita con el token (RF-05). Atómico: valida, comprueba el hueco y mueve la cita
-- en una sola transacción; la restricción de exclusión es la árbitra de la carrera (CA-09).
create function public.reschedule_guest_appointment(
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

revoke all on function public.get_guest_reschedule_availability(text, date) from public;
revoke all on function public.reschedule_guest_appointment(text, uuid, timestamptz) from public;
grant execute on function public.get_guest_reschedule_availability(text, date) to anon, authenticated;
grant execute on function public.reschedule_guest_appointment(text, uuid, timestamptz) to anon, authenticated;

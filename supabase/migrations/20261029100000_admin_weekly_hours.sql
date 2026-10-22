-- T-009c: el Admin edita los horarios semanales del salón y de cada estilista (RF-07, CA-38, CA-39; ADR-0029).
-- 1. schedule_conflicts: citas confirmadas o pendientes futuras que quedarían fuera del horario propuesto.
--    Es interna: la usan las dos funciones de abajo y no la ejecuta nadie más.
-- 2. admin_schedule_conflicts: la misma lógica, para que la aplicación liste las citas afectadas.
-- 3. admin_save_weekly_hours: reemplaza la semana completa de un ámbito (salón o estilista) de forma atómica y
--    rechaza con CONFLICT, deshaciendo todo, si deja citas fuera.

-- p_ranges: [{"weekday": 1..7, "starts": "HH:MM", "ends": "HH:MM"}, ...] del ámbito propuesto.
-- p_stylist_id null = horario del SALÓN (se comprueban las citas de todas las estilistas).
create function public.schedule_conflicts(p_stylist_id uuid, p_ranges jsonb)
returns table (appointment_id uuid, stylist_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with proposed as (
    select (r ->> 'weekday')::int as wd, (r ->> 'starts')::time as s, (r ->> 'ends')::time as e
    from jsonb_array_elements(p_ranges) r
  ),
  salon as (
    select h.weekday as wd, h.opens as s, h.closes as e
    from public.salon_hours h
    where p_stylist_id is not null
    union all
    select p.wd, p.s, p.e from proposed p where p_stylist_id is null
  ),
  styl as (
    select ss.stylist_id as sid, ss.weekday as wd, ss.starts as s, ss.ends as e
    from public.stylist_schedule ss
    where p_stylist_id is null or ss.stylist_id <> p_stylist_id
    union all
    select p_stylist_id, p.wd, p.s, p.e from proposed p where p_stylist_id is not null
  ),
  windows as (
    select st.sid, st.wd,
           greatest(st.s, sa.s) as ws,
           least(st.e, sa.e) as we
    from styl st
    join salon sa on sa.wd = st.wd
    where greatest(st.s, sa.s) < least(st.e, sa.e)
  ),
  appts as (
    select a.id, a.stylist_id as sid, lower(a.during) as st_at, upper(a.during) as en_at,
           extract(isodow from (lower(a.during) at time zone 'Europe/Madrid'))::int as wd,
           (lower(a.during) at time zone 'Europe/Madrid')::time as ls,
           (upper(a.during) at time zone 'Europe/Madrid')::time as le
    from public.appointments a
    where a.status in ('confirmed', 'pending')
      and lower(a.during) > now()
      and (p_stylist_id is null or a.stylist_id = p_stylist_id)
  )
  select ap.id, ap.sid, ap.st_at, ap.en_at
  from appts ap
  where not exists (
    select 1 from windows w
    where w.sid = ap.sid and w.wd = ap.wd and w.ws <= ap.ls and ap.le <= w.we
  )
  order by ap.st_at;
$$;

revoke all on function public.schedule_conflicts(uuid, jsonb) from public, anon, authenticated;

create function public.admin_schedule_conflicts(p_ranges jsonb, p_stylist_id uuid default null)
returns table (appointment_id uuid, stylist_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_ranges is null or jsonb_typeof(p_ranges) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;
  return query select * from public.schedule_conflicts(p_stylist_id, p_ranges);
end;
$$;

create function public.admin_save_weekly_hours(p_ranges jsonb, p_stylist_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_ranges is null or jsonb_typeof(p_ranges) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  v_count := jsonb_array_length(p_ranges);
  if v_count > 70 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Formato, rango de días, rejilla de 15 min e inicio < fin.
  if exists (
    select 1
    from jsonb_array_elements(p_ranges) r
    where jsonb_typeof(r) <> 'object'
       or (r ->> 'weekday') is null or (r ->> 'weekday') !~ '^[1-7]$'
       or (r ->> 'starts') is null or (r ->> 'starts') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
       or (r ->> 'ends') is null or (r ->> 'ends') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
       or (r ->> 'starts')::time >= (r ->> 'ends')::time
  ) then
    raise exception 'INVALID_INPUT';
  end if;

  -- Sin tramos que se solapen dentro del mismo día.
  if exists (
    select 1
    from jsonb_array_elements(p_ranges) a
    join jsonb_array_elements(p_ranges) b
      on (a ->> 'weekday') = (b ->> 'weekday')
     and a::text <> b::text
     and (a ->> 'starts')::time < (b ->> 'ends')::time
     and (b ->> 'starts')::time < (a ->> 'ends')::time
  ) or (
    select count(*) <> count(distinct (r ->> 'weekday') || (r ->> 'starts'))
    from jsonb_array_elements(p_ranges) r
  ) then
    raise exception 'INVALID_INPUT';
  end if;

  if p_stylist_id is not null
     and not exists (select 1 from public.stylists st where st.id = p_stylist_id) then
    raise exception 'INVALID_INPUT';
  end if;

  -- Mismo bloqueo por estilista que la reserva (ADR-0024), en orden de id: una reserva en curso termina antes o
  -- espera. El horario del salón afecta a todas; el de una estilista, solo a ella.
  for v_id in
    select st.id from public.stylists st
    where p_stylist_id is null or st.id = p_stylist_id
    order by st.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || v_id::text, 0));
  end loop;

  if p_stylist_id is null then
    delete from public.salon_hours where true;
    insert into public.salon_hours (weekday, opens, closes)
    select (r ->> 'weekday')::smallint, (r ->> 'starts')::time, (r ->> 'ends')::time
    from jsonb_array_elements(p_ranges) r;
  else
    delete from public.stylist_schedule where stylist_id = p_stylist_id;
    insert into public.stylist_schedule (stylist_id, weekday, starts, ends)
    select p_stylist_id, (r ->> 'weekday')::smallint, (r ->> 'starts')::time, (r ->> 'ends')::time
    from jsonb_array_elements(p_ranges) r;
  end if;

  -- Con el horario ya escrito: si deja citas fuera, se lanza y se deshace todo.
  if exists (select 1 from public.schedule_conflicts(p_stylist_id, p_ranges)) then
    raise exception 'CONFLICT';
  end if;

  return v_count;
end;
$$;

revoke all on function public.admin_schedule_conflicts(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.admin_save_weekly_hours(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_schedule_conflicts(jsonb, uuid) to authenticated;
grant execute on function public.admin_save_weekly_hours(jsonb, uuid) to authenticated;

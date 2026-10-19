-- T-004: servicios por estilista, disponibilidad calculada en BD y señal en tiempo real.
-- Decisiones: ADR-0013 (cálculo en BD y Realtime broadcast), ADR-0014 (stylist_services).

-- ---------------------------------------------------------------------------
-- stylist_services: qué servicios hace cada estilista (ADR-0014)
-- ---------------------------------------------------------------------------

create table public.stylist_services (
  stylist_id uuid not null references public.stylists (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (stylist_id, service_id)
);

create index stylist_services_service_idx on public.stylist_services (service_id);

alter table public.stylist_services enable row level security;

-- Las tablas nuevas heredan privilegios por defecto de Supabase: se revocan y se conceden los mínimos.
revoke all on public.stylist_services from anon, authenticated;
grant select on public.stylist_services to anon, authenticated;
grant insert, update, delete on public.stylist_services to authenticated;

create policy public_select_stylist_services on public.stylist_services
  for select to anon, authenticated using (true);

create policy admin_insert_stylist_services on public.stylist_services
  for insert to authenticated with check (public.is_admin());
create policy admin_update_stylist_services on public.stylist_services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_stylist_services on public.stylist_services
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- get_availability: inicios libres cada 15 min donde cabe la duración del servicio.
-- Devuelve SOLO franjas, nunca datos de citas ni de personas (ADR-0009, ADR-0013).
-- ---------------------------------------------------------------------------

create function public.get_availability(
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
    -- Sin solape con citas activas (las canceladas no bloquean).
    and not exists (
      select 1
      from public.appointments a
      where a.stylist_id = c.stylist_id
        and a.status <> 'cancelled'
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

revoke all on function public.get_availability(uuid, date, uuid) from public;
grant execute on function public.get_availability(uuid, date, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Señal en tiempo real (ADR-0013): broadcast público «availability».
-- El mensaje NO lleva nombre, email, teléfono ni id de cita: solo qué estilista y qué franja.
-- ---------------------------------------------------------------------------

create function public.broadcast_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform realtime.send(
      jsonb_build_object(
        'stylist_id', new.stylist_id,
        'starts_at', lower(new.during),
        'ends_at', upper(new.during),
        'op', tg_op
      ),
      'availability_changed',
      'availability',
      false
    );
  end if;

  -- Borrado, o cambio de estilista o de franja: también se avisa de la franja antigua.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (old.stylist_id is distinct from new.stylist_id
                               or old.during is distinct from new.during)) then
    perform realtime.send(
      jsonb_build_object(
        'stylist_id', old.stylist_id,
        'starts_at', lower(old.during),
        'ends_at', upper(old.during),
        'op', tg_op
      ),
      'availability_changed',
      'availability',
      false
    );
  end if;

  return null;
end;
$$;

revoke all on function public.broadcast_availability_change() from public, anon, authenticated;

create trigger appointments_availability_broadcast
  after insert or update or delete on public.appointments
  for each row execute function public.broadcast_availability_change();

create trigger time_blocks_availability_broadcast
  after insert or update or delete on public.time_blocks
  for each row execute function public.broadcast_availability_change();

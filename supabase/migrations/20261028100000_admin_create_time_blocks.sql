-- T-009b: el Admin crea bloqueos de franja y vacaciones (RF-07, CA-19, CA-20; ADR-0028).
-- Atómica: toma el mismo advisory lock por estilista que la reserva (ADR-0024), rechaza con CONFLICT si hay
-- citas activas dentro del rango (sin insertar nada) y, si no, inserta un bloqueo por estilista.

create function public.admin_create_time_blocks(
  p_stylist_ids uuid[],
  p_kind public.time_block_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_range tstzrange;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(array_agg(distinct s.id order by s.id), '{}'::uuid[])
    into v_ids
  from unnest(coalesce(p_stylist_ids, '{}'::uuid[])) s(id);

  if cardinality(v_ids) not between 1 and 50
     or p_kind is null or p_kind not in ('vacation', 'block')
     or p_starts_at is null or p_ends_at is null
     or p_starts_at >= p_ends_at
     or p_ends_at <= now()
     or p_ends_at - p_starts_at > interval '366 days'
     or (v_note is not null and char_length(v_note) > 200) then
    raise exception 'INVALID_INPUT';
  end if;

  if (select count(*) from public.stylists st where st.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'INVALID_INPUT';
  end if;

  v_range := tstzrange(p_starts_at, p_ends_at, '[)');

  -- Bloqueo por estilista, siempre en orden de id (ADR-0024): una reserva en curso termina antes o espera.
  foreach v_id in array v_ids loop
    perform pg_advisory_xact_lock(hashtextextended('booking-stylist:' || v_id::text, 0));
  end loop;

  -- Las citas confirmadas o pendientes dentro del rango hay que resolverlas antes (spec, sección 5).
  if exists (
    select 1
    from public.appointments a
    where a.stylist_id = any (v_ids)
      and a.status in ('confirmed', 'pending')
      and a.during && v_range
  ) then
    raise exception 'CONFLICT';
  end if;

  insert into public.time_blocks (stylist_id, during, kind, note)
  select s.id, v_range, p_kind, v_note from unnest(v_ids) s(id);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.admin_create_time_blocks(uuid[], public.time_block_kind, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_time_blocks(uuid[], public.time_block_kind, timestamptz, timestamptz, text)
  to authenticated;

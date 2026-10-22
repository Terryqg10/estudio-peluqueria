-- T-009a: el Admin crea y edita servicios (RF-07, CA-18).
-- Una sola función atómica: valida, crea o actualiza el servicio y reemplaza sus estilistas. Exige is_admin()
-- (ADR-0022). Los servicios no se borran (las citas los referencian): se desactivan.

create function public.admin_save_service(
  p_category text,
  p_name text,
  p_price_from_cents integer,
  p_duration_min integer,
  p_active boolean,
  p_stylist_ids uuid[],
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_category text := btrim(coalesce(p_category, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_stylists uuid[] := coalesce(p_stylist_ids, '{}'::uuid[]);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if char_length(v_category) not between 2 and 40
     or char_length(v_name) not between 2 and 80
     or p_price_from_cents is null or p_price_from_cents not between 0 and 999900
     or p_duration_min is null or p_duration_min not between 5 and 480 or p_duration_min % 5 <> 0
     or p_active is null then
    raise exception 'INVALID_INPUT';
  end if;

  -- Todas las estilistas indicadas deben existir.
  if exists (
    select 1 from unnest(v_stylists) s(id)
    where not exists (select 1 from public.stylists st where st.id = s.id)
  ) then
    raise exception 'INVALID_INPUT';
  end if;

  -- Nombre único sin distinguir mayúsculas (la semilla enlaza servicios por nombre).
  if exists (
    select 1 from public.services sv
    where lower(sv.name) = lower(v_name) and sv.id is distinct from p_id
  ) then
    raise exception 'DUPLICATE_NAME';
  end if;

  if p_id is null then
    insert into public.services (category, name, price_from_cents, duration_min, active, sort_order)
    values (
      v_category, v_name, p_price_from_cents, p_duration_min, p_active,
      coalesce((select max(sort_order) from public.services), 0) + 1
    )
    returning id into v_id;
  else
    update public.services
    set category = v_category,
        name = v_name,
        price_from_cents = p_price_from_cents,
        duration_min = p_duration_min,
        active = p_active
    where id = p_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
  end if;

  delete from public.stylist_services ss
  where ss.service_id = v_id and ss.stylist_id <> all (v_stylists);

  insert into public.stylist_services (stylist_id, service_id)
  select distinct s.id, v_id from unnest(v_stylists) s(id)
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.admin_save_service(text, text, integer, integer, boolean, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_service(text, text, integer, integer, boolean, uuid[], uuid)
  to authenticated;

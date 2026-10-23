-- T-026 (ADR-0036, RF-13, CA-49, CA-50): la cuenta `demo` lee el panel sin escribir y sin ver datos personales
-- de visitantes. La garantía vive en la BD:
--   · ninguna política de insert, update ni delete admite `demo` (solo `is_admin()`), y las funciones `admin_*`
--     comprueban `is_admin()` dentro, así que `demo` no puede escribir ni por la API ni por la interfaz;
--   · `demo` NO puede leer `appointments`, `appointment_notes` ni `profiles`: las citas las lee por las vistas
--     `panel_appointments` y `panel_appointment_notes`, que enmascaran lo personal salvo en citas de ejemplo.

-- ---------------------------------------------------------------------------
-- is_demo()
-- ---------------------------------------------------------------------------

create function public.is_demo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'demo'
  );
$$;

revoke all on function public.is_demo() from public;
grant execute on function public.is_demo() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Marca de cita de ejemplo (la ponen las semillas de la demo; las reservas reales nacen en falso)
-- ---------------------------------------------------------------------------

alter table public.appointments add column is_sample boolean not null default false;

-- ---------------------------------------------------------------------------
-- Lectura del catálogo y los horarios para `demo` (solo select)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['services', 'stylists', 'stylist_schedule', 'time_blocks']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_demo())',
      'demo_select_' || t, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Enmascarado (funciones puras)
-- ---------------------------------------------------------------------------

-- «María García López» → «María G.»; una sola palabra → inicial y puntos suspensivos.
create function public.mask_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null then null
    when btrim(p_name) !~ '\s' then left(btrim(p_name), 1) || '•••'
    else (regexp_split_to_array(btrim(p_name), '\s+'))[1] || ' '
         || left((regexp_split_to_array(btrim(p_name), '\s+'))[2], 1) || '.'
  end;
$$;

-- «+34 612 345 678» → «•••• 678».
create function public.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null then null
    else '•••• ' || right(regexp_replace(p_phone, '\D', '', 'g'), 3)
  end;
$$;

-- «maria@correo.com» → «m•••@•••».
create function public.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null then null else left(p_email, 1) || '•••@•••' end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas del panel. Se ejecutan con los privilegios de su dueño (la RLS de las tablas base no se aplica), así que
-- el filtro `is_admin() or is_demo()` y el enmascarado van DENTRO de la vista. `security_barrier` impide que un
-- filtro del cliente se evalúe antes y filtre datos por efectos laterales.
-- ---------------------------------------------------------------------------

create view public.panel_appointments
with (security_barrier = true)
as
select
  a.id,
  a.stylist_id,
  a.service_id,
  a.during,
  a.status,
  case when public.is_admin() or a.is_sample then a.user_id end as user_id,
  a.anonymized_at,
  case when public.is_admin() or a.is_sample then a.guest_name else public.mask_name(a.guest_name) end as guest_name,
  case when public.is_admin() or a.is_sample then a.guest_email else public.mask_email(a.guest_email) end as guest_email,
  case when public.is_admin() or a.is_sample then a.guest_phone else public.mask_phone(a.guest_phone) end as guest_phone,
  case when public.is_admin() or a.is_sample then p.full_name else public.mask_name(p.full_name) end as profile_name,
  case when public.is_admin() or a.is_sample then p.phone else public.mask_phone(p.phone) end as profile_phone,
  a.is_sample,
  a.created_at,
  a.updated_at
from public.appointments a
left join public.profiles p on p.id = a.user_id
where public.is_admin() or public.is_demo();

create view public.panel_appointment_notes
with (security_barrier = true)
as
select n.appointment_id, n.note, n.updated_at
from public.appointment_notes n
join public.appointments a on a.id = n.appointment_id
where public.is_admin() or (public.is_demo() and a.is_sample);

revoke all on public.panel_appointments, public.panel_appointment_notes from anon, authenticated;
grant select on public.panel_appointments, public.panel_appointment_notes to authenticated;

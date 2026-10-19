-- T-002: RLS en todas las tablas. Defecto: denegado.
-- Políticas explícitas de select, insert, update y delete (rules/security.md).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activar RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.stylists enable row level security;
alter table public.salon_hours enable row level security;
alter table public.stylist_schedule enable row level security;
alter table public.time_blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Privilegios de tabla (defensa en profundidad además de RLS)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- Catálogo y horario del salón: lectura pública.
grant select on public.services, public.stylists, public.salon_hours to anon, authenticated;

-- Resto: authenticated con permisos de tabla; la RLS decide qué filas.
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on
  public.services, public.stylists, public.salon_hours,
  public.stylist_schedule, public.time_blocks, public.appointments
  to authenticated;
-- appointment_tokens: sin acceso para anon ni authenticated; solo las
-- funciones security definer (ADR-0009) y service_role.

-- ---------------------------------------------------------------------------
-- Políticas de Admin (las 4 operaciones, explícitas, en cada tabla)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'services', 'stylists', 'salon_hours',
    'stylist_schedule', 'time_blocks', 'appointments'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      'admin_select_' || t, t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      'admin_insert_' || t, t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      'admin_update_' || t, t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      'admin_delete_' || t, t);
  end loop;
end
$$;

-- Los privilegios de columna limitan a los clientes, pero Admin necesita
-- cambiar cualquier columna de profiles (p. ej. el rol) solo vía service_role:
-- no se concede UPDATE de role a authenticated.

-- ---------------------------------------------------------------------------
-- Públicas / de cliente
-- ---------------------------------------------------------------------------

-- Catálogo: solo filas activas para el público.
create policy public_select_services on public.services
  for select to anon, authenticated using (active);

create policy public_select_stylists on public.stylists
  for select to anon, authenticated using (active);

create policy public_select_salon_hours on public.salon_hours
  for select to anon, authenticated using (true);

-- Perfil propio: leer y actualizar nombre/teléfono. El rol no se puede
-- cambiar (sin privilegio de columna) ni se puede crear/borrar un perfil.
create policy own_select_profiles on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy own_update_profiles on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Citas: una clienta lee solo las suyas. No hay INSERT/UPDATE/DELETE directo
-- para clientas (ADR-0009): sus cambios van por funciones (T-006/T-007).
-- anon no tiene ninguna política sobre appointments: denegado.
create policy own_select_appointments on public.appointments
  for select to authenticated using (user_id = (select auth.uid()));

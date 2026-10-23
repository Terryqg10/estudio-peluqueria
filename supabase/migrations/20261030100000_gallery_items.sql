-- T-011: galería antes/después (RF-01, CA-02). Una fila por trabajo: técnica, servicio y estilista para enlazar
-- a la reserva, las dos imágenes (rutas bajo /images/galeria/) con su texto alternativo y si están generadas
-- con IA (PLAN-001, 5a: constan como tales). Lectura pública de los activos; gestión solo del Admin.

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  technique text not null check (char_length(technique) between 2 and 30),
  service_id uuid not null references public.services (id) on delete cascade,
  stylist_id uuid not null references public.stylists (id) on delete cascade,
  before_path text not null check (before_path ~ '^/images/galeria/[a-z0-9._-]+$'),
  after_path text not null check (after_path ~ '^/images/galeria/[a-z0-9._-]+$'),
  alt_before text not null check (char_length(alt_before) between 5 and 200),
  alt_after text not null check (char_length(alt_after) between 5 and 200),
  ai_generated boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index gallery_items_technique_idx on public.gallery_items (technique);

alter table public.gallery_items enable row level security;

revoke all on public.gallery_items from anon, authenticated;
grant select on public.gallery_items to anon, authenticated;
grant insert, update, delete on public.gallery_items to authenticated;

create policy public_select_gallery_items on public.gallery_items
  for select to anon, authenticated using (active);

-- El Admin ve también los inactivos y puede gestionarlos (las cuatro operaciones, explícitas).
create policy admin_select_gallery_items on public.gallery_items
  for select to authenticated using (public.is_admin());
create policy admin_insert_gallery_items on public.gallery_items
  for insert to authenticated with check (public.is_admin());
create policy admin_update_gallery_items on public.gallery_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_gallery_items on public.gallery_items
  for delete to authenticated using (public.is_admin());

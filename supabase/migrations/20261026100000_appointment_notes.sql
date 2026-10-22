-- T-008d: notas internas de la cita para la estilista (ADR-0027). Tabla aparte: una clienta lee todas
-- las columnas de sus citas, así que la nota no puede vivir en `appointments`. Solo el Admin (RLS).

create table public.appointment_notes (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 500),
  updated_at timestamptz not null default now()
);

alter table public.appointment_notes enable row level security;

revoke all on public.appointment_notes from anon, authenticated;
grant select, insert, update, delete on public.appointment_notes to authenticated;

create policy admin_select_appointment_notes on public.appointment_notes
  for select to authenticated using (public.is_admin());
create policy admin_insert_appointment_notes on public.appointment_notes
  for insert to authenticated with check (public.is_admin());
create policy admin_update_appointment_notes on public.appointment_notes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_appointment_notes on public.appointment_notes
  for delete to authenticated using (public.is_admin());

-- T-002: esquema base de reservas.
-- Decisiones: ADR-0009 (token de invitada), ADR-0010 (estados de cita).
-- Todos los datos de negocio de la semilla son ficticios (VERIFICAR) y viven en seed.sql.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('client', 'admin');

-- ADR-0010. Ocupan hueco: todos salvo 'cancelled'.
create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'cancelled'
);

create type public.time_block_kind as enum ('vacation', 'break', 'block');

-- ---------------------------------------------------------------------------
-- profiles: una fila por cuenta de auth. El rol nunca viene del cliente.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  price_from_cents integer not null check (price_from_cents >= 0),
  duration_min integer not null check (duration_min > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.stylists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Horarios y bloqueos. weekday sigue ISO: 1 = lunes ... 7 = domingo.
-- Las horas son locales del salón (Europe/Madrid); la conversión a UTC
-- se hace al calcular disponibilidad (T-004).
-- ---------------------------------------------------------------------------

create table public.salon_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  check (opens < closes),
  unique (weekday, opens)
);

create table public.stylist_schedule (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  starts time not null,
  ends time not null,
  check (starts < ends),
  unique (stylist_id, weekday, starts)
);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists (id) on delete cascade,
  during tstzrange not null check (not isempty(during)),
  kind public.time_block_kind not null default 'block',
  note text,
  created_at timestamptz not null default now()
);

create index time_blocks_stylist_during_idx
  on public.time_blocks using gist (stylist_id, during);

-- ---------------------------------------------------------------------------
-- appointments
-- user_id es NULL para reservas de invitada (ADR-0009). El token de gestión
-- NO se guarda aquí: vive como hash en appointment_tokens.
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  during tstzrange not null check (not isempty(during)),
  status public.appointment_status not null default 'confirmed',
  user_id uuid references auth.users (id) on delete set null,
  guest_name text,
  guest_email text,
  guest_phone text,
  consent_at timestamptz,
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Toda cita identifica a una persona: cuenta o datos de invitada completos.
  constraint appointments_has_owner check (
    user_id is not null
    or (guest_name is not null and guest_email is not null and guest_phone is not null)
  ),

  -- CA-09: una estilista no puede tener dos citas activas solapadas.
  -- Las canceladas no bloquean. La garantía vive en la BD, no en la interfaz.
  constraint appointments_no_overlap exclude using gist (
    stylist_id with =,
    during with &&
  ) where (status <> 'cancelled')
);

create index appointments_user_id_idx on public.appointments (user_id);
create index appointments_stylist_during_idx
  on public.appointments using gist (stylist_id, during);

-- Token de gestión de invitada (ADR-0009): solo hash, nunca el token en claro.
create table public.appointment_tokens (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al crear una cuenta. El rol siempre es 'client';
-- un Admin se promueve solo con una operación de servicio.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'client');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Advance Seeds Field Inspector — initial schema.
-- Tables: profiles, varieties, batches, calibration_profiles, inspections, seeds.
-- Constraints: every table has its own RLS policy file (next migration).

-- ============================================================================
-- 1. Extensions
-- ============================================================================

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto"  with schema extensions;

-- ============================================================================
-- 2. Enums
-- ============================================================================

create type public.role as enum ('inspector', 'admin');

create type public.locale as enum ('en', 'th');

create type public.calibration_source as enum ('lidar', 'aruco');

create type public.inspection_status as enum ('pending', 'analyzing', 'complete', 'failed');

create type public.seed_grade as enum ('A', 'B', 'C', 'reject');

-- ============================================================================
-- 3. profiles — one row per auth.users entry (linked 1:1)
-- ============================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.role not null default 'inspector',
  locale      public.locale not null default 'en',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth.users row arrives.
-- Demo seed sets role/full_name explicitly via service_role; signups default to 'inspector'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.role, 'inspector')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================================
-- 4. Reference data: varieties, batches, calibration_profiles
-- ============================================================================

create table public.varieties (
  id               uuid primary key default extensions.uuid_generate_v4(),
  name             text not null unique,
  scientific_name  text,
  description      text,
  image_url        text,
  -- color_key matches the variety palette in design-tokens.json (corn, rice, legume, mungbean)
  color_key        text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table public.batches (
  id          uuid primary key default extensions.uuid_generate_v4(),
  code        text not null unique,
  location    text,
  sown_at     date,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.calibration_profiles (
  id          uuid primary key default extensions.uuid_generate_v4(),
  name        text not null unique,
  px_per_mm   numeric(8,4) not null check (px_per_mm > 0),
  source      public.calibration_source not null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 5. inspections + seeds
-- ============================================================================

create table public.inspections (
  id              uuid primary key default extensions.uuid_generate_v4(),
  inspector_id    uuid not null references public.profiles(id) on delete cascade,
  variety_id      uuid not null references public.varieties(id) on delete restrict,
  batch_id        uuid references public.batches(id) on delete set null,
  calibration_id  uuid references public.calibration_profiles(id) on delete set null,
  image_url       text not null,
  captured_at     timestamptz not null default now(),
  status          public.inspection_status not null default 'complete',
  total_seeds     integer not null default 0 check (total_seeds >= 0),
  mean_length_mm  numeric(6,3),
  mean_width_mm   numeric(6,3),
  mean_area_mm2   numeric(8,3),
  notes           text,
  created_at      timestamptz not null default now()
);

create index inspections_inspector_idx   on public.inspections (inspector_id);
create index inspections_variety_idx     on public.inspections (variety_id);
create index inspections_batch_idx       on public.inspections (batch_id);
create index inspections_captured_at_idx on public.inspections (captured_at desc);

create table public.seeds (
  id             uuid primary key default extensions.uuid_generate_v4(),
  inspection_id  uuid not null references public.inspections(id) on delete cascade,
  index          integer not null check (index >= 1),
  length_mm      numeric(6,3) not null check (length_mm > 0),
  width_mm       numeric(6,3) not null check (width_mm > 0),
  area_mm2       numeric(8,3) not null check (area_mm2 > 0),
  grade          public.seed_grade not null,
  defects        jsonb not null default '{}'::jsonb,
  bbox           jsonb not null,
  unique (inspection_id, index)
);

create index seeds_inspection_idx on public.seeds (inspection_id);

-- ============================================================================
-- 6. Convenience: updated_at not used (immutable rows + soft updates via notes only),
--    but include a touched_at on profiles for completeness.
-- ============================================================================

alter table public.profiles add column if not exists touched_at timestamptz not null default now();

create or replace function public.touch_profile()
returns trigger language plpgsql as $$
begin
  new.touched_at := now();
  return new;
end;
$$;

create trigger profiles_touched
before update on public.profiles
for each row execute function public.touch_profile();

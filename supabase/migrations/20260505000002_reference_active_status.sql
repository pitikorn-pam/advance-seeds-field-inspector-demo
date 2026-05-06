-- Active/inactive controls for reference data.
-- Inactive rows remain readable for historical inspections, but capture setup
-- filters them out so operators cannot use retired varieties or batches.

alter table public.varieties
  add column if not exists is_active boolean not null default true;

alter table public.batches
  add column if not exists is_active boolean not null default true;

create index if not exists varieties_is_active_idx
  on public.varieties (is_active);

create index if not exists batches_is_active_idx
  on public.batches (is_active);

comment on column public.varieties.is_active is
  'When false, the variety is hidden from new capture setup usage but retained for historical records.';

comment on column public.batches.is_active is
  'When false, the batch is hidden from new capture setup usage but retained for historical records.';

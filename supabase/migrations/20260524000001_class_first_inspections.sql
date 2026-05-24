-- Class-first inspection workflow.
--
-- New captures can run detector filter ALL or a model class without selecting
-- one legacy variety up front. Variety remains for historical rows and
-- reference-data joins, but class identity is persisted per detected object.

alter table public.inspections
  alter column variety_id drop not null;

alter table public.seeds
  add column if not exists class_id integer,
  add column if not exists class_name text;

comment on column public.inspections.variety_id is
  'Legacy or derived reference variety. Null for class-first captures that detect multiple model classes.';

comment on column public.seeds.class_id is
  'Model detector class index for the detected object, when provided by model-backed analysis.';

comment on column public.seeds.class_name is
  'Model detector class label resolved from the active model metadata at capture time.';

create index if not exists seeds_class_name_idx
  on public.seeds (class_name)
  where class_name is not null;

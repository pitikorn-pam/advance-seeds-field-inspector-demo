-- Capture-class mapping for the on-device analyzer.
-- `coco_class_id` is the index in the COCO 80-class label set used by the
-- bundled YOLO model. Nullable: a variety without a mapping is still
-- visible in the picker but the live analyzer can't auto-detect it.
--
-- `ref_length_mm` / `ref_width_mm` are reference dimensions used for
-- per-variety grading once Phase D ships the master-data form. Both
-- nullable so existing rows continue to work.

alter table public.varieties
  add column if not exists coco_class_id integer,
  add column if not exists ref_length_mm numeric,
  add column if not exists ref_width_mm  numeric;

create unique index if not exists varieties_coco_class_id_key
  on public.varieties (coco_class_id)
  where coco_class_id is not null;

-- Seed the demo capture classes (banana / apple / orange / broccoli / carrot)
-- so a fresh database boots into the same state the mobile demo expects.
-- Stable UUIDs let the app reference them without a lookup-by-name dance.
insert into public.varieties (id, name, scientific_name, color_key, coco_class_id, ref_length_mm, ref_width_mm)
values
  ('00000000-0000-4000-8000-000000004601', 'Banana',   'Musa acuminata',      'corn',    46, 180, 35),
  ('00000000-0000-4000-8000-000000004701', 'Apple',    'Malus domestica',     'legume',  47, 80,  75),
  ('00000000-0000-4000-8000-000000004901', 'Orange',   'Citrus sinensis',     'mungbean',49, 75,  72),
  ('00000000-0000-4000-8000-000000005001', 'Broccoli', 'Brassica oleracea',   'rice',    50, 160, 130),
  ('00000000-0000-4000-8000-000000005101', 'Carrot',   'Daucus carota',       'corn',    51, 180, 28)
on conflict (id) do update set
  name = excluded.name,
  scientific_name = excluded.scientific_name,
  color_key = excluded.color_key,
  coco_class_id = excluded.coco_class_id,
  ref_length_mm = excluded.ref_length_mm,
  ref_width_mm  = excluded.ref_width_mm;

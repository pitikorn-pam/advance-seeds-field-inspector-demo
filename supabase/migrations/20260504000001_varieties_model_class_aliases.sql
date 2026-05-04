-- Per-variety overrides for the active detection model's class names.
-- The variety editor surfaces the active model's `class_names` as a
-- multi-select chip group; selected names land in this array. The
-- live-detector reads this column FIRST and falls back to legacy
-- `coco_class_id` when null/empty so existing rows keep working.
--
-- Column is nullable (vs default '{}') so we can distinguish "operator
-- explicitly cleared aliases" from "never edited" — the live detector
-- treats both as fallthrough but the editor can warn on the empty
-- explicit case ("variety has no model classes assigned").

alter table varieties
  add column if not exists model_class_aliases text[];

comment on column varieties.model_class_aliases is
  'Class names from the active model (e.g. ["banana","banana_spot"]) that '
  'identify this variety. When set, takes precedence over coco_class_id '
  'in the live-detector class filter. Null = inherit from name+coco mapping.';

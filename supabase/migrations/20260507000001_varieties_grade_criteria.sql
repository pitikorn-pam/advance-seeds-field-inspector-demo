-- Variety-owned A/B/C grading criteria for analyzer measurement results.
-- Shape:
-- {
--   "A": {
--     "length_mm": { "min": 1.0, "max": 1.2 },
--     "width_mm": { "min": 0.8, "max": 1.0 }
--   },
--   "B": { ... },
--   "C": { ... }
-- }

alter table public.varieties
  add column if not exists grade_criteria jsonb;

comment on column public.varieties.grade_criteria is
  'Optional A/B/C grading criteria by length/width millimeter ranges. First matching grade wins; no match maps to reject.';

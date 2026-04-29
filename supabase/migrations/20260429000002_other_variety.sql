-- Seeds an "Other" variety row so inspections can be tagged when the
-- inspector doesn't know the specific variety. Stable UUID so the app
-- can reference it as a default fallback.
--
-- The row is just another variety from the DB's perspective — it shows
-- up in queries / reports / CSV exports normally. UI surfaces it as a
-- distinct option in the variety dropdown for clarity, but no code path
-- treats it as special.

insert into public.varieties (id, name, scientific_name, description, color_key)
values (
  '00000000-0000-4000-8000-000000000001',
  'Other',
  null,
  'Use when the specific variety is unknown or not yet in the library.',
  null
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description;

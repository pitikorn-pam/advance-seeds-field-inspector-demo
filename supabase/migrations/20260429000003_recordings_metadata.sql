-- Adds a metadata jsonb bag to recordings, mirroring the inspections.metadata
-- column. The first user is the auto-tag-location feature (capture session's
-- locationTagEnabled toggle stamps GPS coords into metadata.location). Future
-- additions — device pose, ambient light, calibration confidence at record
-- time — slot into the same bag without further migrations.
--
-- Constrain to objects-only so the column can never hold a bare scalar or
-- array. Same pattern used on inspections.metadata.

alter table public.recordings
  add column if not exists metadata jsonb;

alter table public.recordings
  drop constraint if exists recordings_metadata_object;

alter table public.recordings
  add constraint recordings_metadata_object
  check (metadata is null or jsonb_typeof(metadata) = 'object');

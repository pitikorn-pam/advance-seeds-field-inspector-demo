-- Phase 6b.8 — generic metadata bag on inspections.
-- Holds capture-time context that doesn't deserve its own column yet:
-- the active ROI shape, ambient sensor readings, ML model version, etc.
-- Shape is documented in packages/types/src/domain.ts (InspectionMetadata).
--
-- We deliberately don't constrain the JSON beyond `is null OR is an object`
-- — over-constraining a metadata field defeats its purpose, and the
-- application layer is the source of truth for the per-key contract.

alter table public.inspections
  add column metadata jsonb;

alter table public.inspections
  add constraint inspections_metadata_object_check
  check (metadata is null or jsonb_typeof(metadata) = 'object');

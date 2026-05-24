## Context

The mobile capture flow currently treats variety selection as a required precondition. That made sense when a selected variety was the only way to decide which detector classes and grading criteria to use. The active installed models now expose their own `metadata.class_names`, and the product direction is class-first: inspectors choose `ALL` or a model class filter, the model detects those classes, and the saved result keeps class identity per detected seed/object.

The analyzer and overlay pipeline already has the most important seam: `classFilter: null` means accept all model classes, and model-backed `AnalyzedSeed` objects can carry `class_id`. The weak point is persistence and workflow ownership. `inspections.variety_id` is currently required, seed rows do not persist class identity, setup blocks without a selected variety, and detail filtering only understands grade-level filters.

## Goals / Non-Goals

**Goals:**

- Make the inspection entry flow class-first with an `ALL` detector filter plus model class filters from the active installed model.
- Keep live and post-shutter detection filter semantics identical.
- Persist `class_id` and `class_name` per seed/object so saved inspection detail can filter thumbnails by class after reload.
- Preserve lightweight inspection-level summaries in metadata: detector filter, class breakdown, and active model class names.
- Keep legacy rows readable when class fields are absent.

**Non-Goals:**

- No ML training/export changes.
- No full reporting redesign in this change.
- No backfill inference for old inspections.
- No user-managed class grouping UI beyond active model class names and existing reference-data aliases.

## Decisions

### Decision 1: Treat model class as the capture filter source of truth

Capture setup will present `ALL` and active model class names. `ALL` resolves to `classFilter: null`; a selected class resolves to its model class index. Variety rows may still provide display/reference metadata, but they no longer gate capture start.

Alternatives considered:

- Keep required variety and add an `ALL` variety. Rejected because it keeps the wrong domain model: variety remains a pre-detect business choice rather than a model output.
- Infer a dominant variety after detection. Rejected as core behavior because it loses mixed-class information and exists only to satisfy legacy persistence.

### Decision 2: Persist class identity on seed rows

The backend will add nullable `seeds.class_id` and `seeds.class_name`. Inspection metadata will also store a class breakdown summary, but the per-object fact lives with the seed row.

Alternatives considered:

- Store only `class_breakdown` or `seed_classes` in `inspections.metadata`. Rejected for the primary design because it makes detail filters and future reports depend on index matching inside JSON.
- Store only an inspection-level variety array. Rejected because it cannot answer which seed belongs to which class.

### Decision 3: Relax inspection-level variety to legacy/derived metadata

`inspections.variety_id` will no longer be the source of truth for new class-first captures. It should become nullable or a legacy/derived primary-class compatibility field. Screens that join `varieties` must handle null variety rows.

The migration should prefer nullable `variety_id` over introducing a synthetic "Mixed" variety, because a fake row would pollute reports and hide unmapped model behavior.

### Decision 4: Keep grading conservative in the first pass

For class-first captures, grading will use mapped class/variety criteria when a class can be mapped to a variety reference row; otherwise it falls back to the analyzer's generic grading behavior. The applied class and available mapping should be captured in metadata/seed fields so the result is traceable.

### Decision 5: Backward compatibility is read-time, not backfill

Existing inspections without seed class fields remain readable. Detail class filters render only when loaded seeds or metadata expose class identity. No old rows are backfilled as part of this change.

## Data Model

Supabase migration:

- `inspections.variety_id uuid null` or equivalent legacy-compatible nullable change.
- `seeds.class_id integer null`.
- `seeds.class_name text null`.
- Optional `seeds.variety_id uuid null references public.varieties(id) on delete set null` only if implementation maps model class names to reference varieties at save time.

RLS intent does not change: ownership still flows through `inspections.inspector_id`; seed access remains scoped by parent inspection. New nullable columns do not grant additional access.

Generated TypeScript types must be regenerated with `pnpm supabase:types` after the migration.

## Metadata Contract

New inspection metadata fields:

- `detector_filter`: `{ mode: "all" | "classes", class_names: string[], class_ids: number[] }`
- `class_breakdown`: array of `{ class_id: number | null, class_name: string, count: number }`
- `analyzer_model.class_names`: already required by the model snapshot and remains the display source for labels.

Seed metadata/mask metadata should continue to include polygon and volume data. Class labels in metadata must match the saved seed `class_name`.

## Migration Plan

1. Add migration for nullable inspection variety and seed class columns.
2. Regenerate Supabase types.
3. Update mobile save and offline queue payloads to carry new seed class fields.
4. Update capture session/setup to use detector filters.
5. Update live and post-shutter analyzer wiring to use the detector filter resolver.
6. Update review/detail/per-seed screens to display and filter class-aware results.
7. Run targeted mobile tests, save payload tests, offline replay tests, and OpenSpec validation.

Rollback strategy: keep new columns nullable and additive. If class-first UI must be rolled back, old variety-based capture can still save rows because the legacy columns remain present.

## Risks / Trade-offs

- Schema and queue payload drift → Update migration, generated types, save payload, and replay in the same implementation slice.
- Existing rows lack class identity → Hide class filters for old rows and render existing grade filters unchanged.
- Model class names differ from product names → Use model class names as source of truth; use variety/reference aliases only for optional display and grading mapping.
- Reporting filters remain variety-oriented → Keep report redesign out of this change, but preserve class breakdown metadata for a follow-up.

## Open Questions

- Should implementation include optional `seeds.variety_id`, or only `class_id/class_name` plus metadata mapping? The proposal works with either; the leaner first pass is `class_id/class_name`.
- Should selected-class filters allow multi-select in the first implementation, or only `ALL` plus one class? The expected flow names `ALL, banana, watermelon`; single-select is sufficient unless product asks for multi-select.

## Why

The current capture workflow still requires a selected variety before inspection, then filters model output through that variety. This conflicts with the new model behavior and product goal: inspectors should choose `ALL` or a detector class filter, let the model detect every trained class when requested, and review/filter per-seed results by detected class.

## What Changes

- Replace required variety selection in the inspection entry flow with a detector class filter: `ALL` plus class names from the active installed model.
- Make live and post-shutter analysis use the same class filter semantics: `ALL` means no detector class filter; selected class filters restrict both paths.
- Persist detected class identity per seed/object so inspection detail can filter thumbnails by class after save and reload.
- Store inspection-level detector filter and class breakdown metadata for traceability and lightweight summary/report compatibility.
- Preserve legacy inspection rendering for rows without per-seed class data.
- **BREAKING**: New mobile inspections no longer require a single inspection-level variety as the source of truth; `inspections.variety_id` becomes legacy/nullable or a derived primary-class compatibility field.

## Non-goals

- Do not redesign the full reporting module in this change.
- Do not change model training/export class definitions in the ML repo.
- Do not add user-managed class grouping beyond active model class names and existing reference-data mappings.
- Do not re-run inference on old inspections to backfill class data.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `live-camera-capture`: Capture setup and live inference SHALL support `ALL` and selected detector-class filters instead of requiring a variety preselection.
- `inspections-management`: Inspection creation, review, save, detail, and per-seed views SHALL preserve and use detected class identity per seed/object.
- `mobile-offline-sync`: Queued inspection payloads SHALL retain per-seed class identity and detector filter metadata through replay.
- `supabase-backend`: Schema and generated types SHALL support class-first inspections with per-seed class fields and nullable/legacy inspection-level variety.

## Impact

- Mobile capture flow: setup, scan/precise, processing, review, inspection detail, per-seed detail.
- Analyzer wiring: class filter construction for Core ML/TFLite live and post-shutter paths.
- Supabase schema, generated types, save payloads, and queue replay.
- i18n copy for detector filter labels and class-aware review/detail UI.
- Existing seeded/demo inspections and history/detail screens must remain readable when class fields are absent.

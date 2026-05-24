## 1. Schema and Types

- [x] 1.1 Add a Supabase migration that relaxes `inspections.variety_id` for class-first captures and adds nullable seed class identity columns (`class_id`, `class_name`; optionally `variety_id` only if implementation maps class to reference variety at save time).
- [x] 1.2 Update Supabase seed/demo data only if required by the migration, keeping existing demo inspections readable.
- [x] 1.3 Regenerate TypeScript Supabase types with `pnpm supabase:types`.
- [x] 1.4 Update domain/shared types so persisted seeds can carry nullable class identity without breaking legacy inspection rows.

## 2. Save Payload and Offline Sync

- [x] 2.1 Extend inspection save payload assembly to preserve `class_id` and resolved `class_name` for every model-backed seed.
- [x] 2.2 Add `detector_filter` and `class_breakdown` to inspection metadata during save.
- [x] 2.3 Extend local inspection queue payload types to include per-seed class fields and detector metadata.
- [x] 2.4 Update sync replay to insert seed class fields when queued inspections are replayed.
- [x] 2.5 Add or update save payload and sync replay tests for class-first inspections and legacy rows without class data.

## 3. Detector Filter State and Setup

- [x] 3.1 Add capture session state for detector filter mode (`all` or selected class names/ids) separate from legacy `varietyId`.
- [x] 3.2 Replace required variety selection in `/capture/setup` with detector filter selection using active model `metadata.class_names`.
- [x] 3.3 Keep model and camera preflight gates required, but remove variety-binding as a blocker for `ALL`.
- [x] 3.4 Add EN/TH i18n strings for detector filter labels, empty/loading states, and class-first setup copy.
- [x] 3.5 Add setup tests or source assertions covering default `ALL`, selected model class, missing model, and no required variety.

## 4. Live and Post-Shutter Analyzer Wiring

- [x] 4.1 Create a shared detector filter resolver that maps `ALL` to `classFilter: null` and selected model class names to model class indexes.
- [x] 4.2 Update live capture (`scan` and `precise`) to use the shared resolver and stop falling back to bundled/default capture class IDs when no variety is selected.
- [x] 4.3 Update post-shutter processing to use the same resolver as live capture.
- [x] 4.4 Ensure native polygon decode receives an empty class filter for `ALL` and selected indexes for class-filtered captures.
- [x] 4.5 Add tests or source assertions for live/post parity, `ALL` no-filter behavior, and selected-class index behavior.

## 5. Review and Detail UI

- [x] 5.1 Update Review to show detector filter and class breakdown for `ALL` captures without requiring a single selected variety.
- [x] 5.2 Update inspection save guard so model-backed class-first captures can save when no legacy variety is selected.
- [x] 5.3 Load saved seed class fields in inspection detail and per-seed detail queries/types.
- [x] 5.4 Add class filter chips to the inspection detail seed grid when saved class data exists.
- [x] 5.5 Keep legacy inspection detail behavior unchanged when class data is absent.
- [x] 5.6 Add EN/TH i18n strings for class breakdown and detail class filters.

## 6. Compatibility, QA, and Documentation

- [x] 6.1 Run `openspec validate --all --strict` and fix any proposal/spec/task issues.
- [x] 6.2 Run targeted mobile tests for analyzer decoding, save payloads, sync replay, setup, processing, and inspection detail filtering.
- [x] 6.3 Run `pnpm -F @advance-seeds/mobile typecheck`.
- [x] 6.4 Update CHANGELOG with the class-first detect-all workflow, schema impact, and QA caveats.
- [x] 6.5 Update handoff notes to state that old variety-required workflow is deprecated and class identity is now persisted per seed/object.

# Changelog

All notable changes to the Advance Seeds Field Inspector demo (Expo mobile + Supabase).

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not publish semver versions.

## [Unreleased]

### Changed

- Started the class-first detect-all inspection workflow behind OpenSpec change `detect-all-class-first-inspection`. Capture setup now defaults to detector filter `ALL` and lists active model `metadata.class_names` as optional single-class filters instead of requiring a legacy variety before opening the camera.
- Live scan, precise capture, and post-shutter analysis now share a detector filter resolver: `ALL` passes no analyzer class filter, while a selected model class resolves to active-model class indexes/aliases. The previous fallback to bundled/default capture class IDs was removed from the class-first path.
- Inspection save, offline queue, replay, review, and detail now carry nullable per-seed `class_id` / `class_name`, plus `metadata.detector_filter` and `metadata.class_breakdown`. Inspection detail shows class filter chips when saved class data exists while keeping legacy rows without class data readable.

### Database

- Added migration `20260524000001_class_first_inspections.sql` to relax `inspections.variety_id` and add nullable `seeds.class_id` / `seeds.class_name` with a class-name index. Existing demo/legacy rows require no backfill.

### Fixed

- Investigated the live-camera vs post-shutter mismatch where iOS live segmentation overlaid only one object while post-shutter analysis found multiple objects. The live CoreML frame-processor path now flattens the detection `MLMultiArray` using `strides`, matching the post-shutter Swift runner; reading `dataPointer` as packed memory could corrupt/skew detection rows returned from Vision/CoreML and leave JS with only a partial set of usable detections.
- Added `sourceRow` to decoded NMS/segmentation detections and attached native-decoded polygons back by their original tensor row instead of by a guessed kept-detection cursor. This prevents polygon/detection misalignment when some rows pass score/class checks but are later dropped as degenerate or mask-empty.

### In-flight verification

- Metro dev server idled locally on `localhost:8081` to verify that a new model artifact (re-trained on Colab from the ML repo's post-merge `main`) renders multi-detect correctly on the iOS dev client. The artifact lands in the registry's staging channel via `training-callback`; the app pulls it through the Models tab.
- The dev client on the test iPhone may need a fresh rebuild — the team's `main` merge included native CoreML / fast-tflite changes (commits `d28f4c1` _native YOLO mask decode + polygon trace on iOS and Android_, `b77f2fb` _respect MLMultiArray strides in native polygon decode_). If the on-device live overlay misbehaves after the model swap, rebuild the dev client (`npx expo run:ios --device`) before drawing conclusions about the model.
- Latest local patch also touches the native iOS frame processor (`AdvanceSeedsCoreMLFrameProcessorPlugin.mm`), so Metro reload is not enough; rebuild the iOS dev client before Claude/device QA re-tests live multi-object overlay. Verification run so far: `pnpm -F @advance-seeds/mobile typecheck`.
- Class-first workflow verification so far: targeted node tests for save payload, metadata, detector filter resolver, detect-all source assertions, and YOLO decoding pass; `pnpm -F @advance-seeds/mobile typecheck` passes. Supabase CLI was installed locally, the local Supabase stack was started, migration `20260524000001_class_first_inspections.sql` applied, and `pnpm supabase:types` regenerated `packages/types/src/supabase.gen.ts`.

## [2026-05-23]

### Changed

- `dev` branch reset to `198e005 docs: add claude repo guidance` and re-merged with `origin/main` (merge commit `410282b`). The earlier `dde6335 fix(capture): emit mask prototype tensor from still-image CoreML path` and `50293ae fix(capture): live segmentation overlay end-to-end` were dropped in favor of the team's main-branch overlay polygon work (commits `d28f4c1`, `ccab196`, `b77f2fb`, `5fc78cd`, `6a2be40`, `983f267`, `494df6e`, `e6a5982`, `16c6c5e`, `7f00476`, `67070a5`, `8adcdf6`, `7d40ce9`, `bfe03ee`).

### Notes

- The sibling ML repo (`../advance-seeds-field-inspector-ml`) shipped Phase 2 "Dashboard export NMS controls" the same day; it adds `max_det / iou / conf` parameters at mobile-model export time. This change is invisible to the demo app at runtime — the artifact filename contract (`yolo11n-seeds.tflite`) and the `SeedAnalyzer` interface in `packages/types` remain unchanged. New artifacts published to the registry will simply have those NMS knobs reflected in `model-metadata.json::export_options`.

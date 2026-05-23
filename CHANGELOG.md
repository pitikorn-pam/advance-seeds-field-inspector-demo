# Changelog

All notable changes to the Advance Seeds Field Inspector demo (Expo mobile + Supabase).

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not publish semver versions.

## [Unreleased]

### In-flight verification

- Metro dev server idled locally on `localhost:8081` to verify that a new model artifact (re-trained on Colab from the ML repo's post-merge `main`) renders multi-detect correctly on the iOS dev client. The artifact lands in the registry's staging channel via `training-callback`; the app pulls it through the Models tab.
- The dev client on the test iPhone may need a fresh rebuild — the team's `main` merge included native CoreML / fast-tflite changes (commits `d28f4c1` _native YOLO mask decode + polygon trace on iOS and Android_, `b77f2fb` _respect MLMultiArray strides in native polygon decode_). If the on-device live overlay misbehaves after the model swap, rebuild the dev client (`npx expo run:ios --device`) before drawing conclusions about the model.

## [2026-05-23]

### Changed

- `dev` branch reset to `198e005 docs: add claude repo guidance` and re-merged with `origin/main` (merge commit `410282b`). The earlier `dde6335 fix(capture): emit mask prototype tensor from still-image CoreML path` and `50293ae fix(capture): live segmentation overlay end-to-end` were dropped in favor of the team's main-branch overlay polygon work (commits `d28f4c1`, `ccab196`, `b77f2fb`, `5fc78cd`, `6a2be40`, `983f267`, `494df6e`, `e6a5982`, `16c6c5e`, `7f00476`, `67070a5`, `8adcdf6`, `7d40ce9`, `bfe03ee`).

### Notes

- The sibling ML repo (`../advance-seeds-field-inspector-ml`) shipped Phase 2 "Dashboard export NMS controls" the same day; it adds `max_det / iou / conf` parameters at mobile-model export time. This change is invisible to the demo app at runtime — the artifact filename contract (`yolo11n-seeds.tflite`) and the `SeedAnalyzer` interface in `packages/types` remain unchanged. New artifacts published to the registry will simply have those NMS knobs reflected in `model-metadata.json::export_options`.

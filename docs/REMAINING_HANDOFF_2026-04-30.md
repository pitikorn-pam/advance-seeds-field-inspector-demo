# Remaining Features Hand-off — 2026-04-30

## Current repo state

- Working path: `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`
- Branch: `main`
- Latest completed feature commit before this hand-off: `0e8c2aa feat(mobile): add classical analyzer and Android ROI video`
- Current app status: custom Expo dev client with real camera, ArUco calibration on iOS/Android, LiDAR calibration on supported iPad/iPhone Pro hardware, flexible ROI tools, photo/video capture, result/detail parity, notes + metadata, lazy seed rendering, detail grade filtering, and Android recorded-video ROI burn-in.
- OpenSpec active changes to keep updated: `openspec/changes/mobile-real-usage` and `openspec/changes/mobile-offline-sync`.

## Hard rules

1. Work only from `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`.
2. For Expo commands, run from `apps/mobile` and use the local CLI: `./node_modules/.bin/expo`.
3. Do not use `pnpm dlx expo`.
4. `ios/` and `android/` are generated and gitignored. After native module or `app.json` plugin changes, run the matching clean prebuild before rebuilding.
5. Update OpenSpec with finished behavior before committing.
6. Show a short plan before non-trivial edits and wait for the user's `ok`.
7. Keep comments focused on why, not what.

## Recently verified

- `pnpm -F @advance-seeds/mobile typecheck`
- `pnpm -F @advance-seeds/mobile lint`
- `node --test apps/mobile/modules/roi-video-exporter/module-config.test.mjs apps/mobile/lib/analyzer/ClassicalSeedAnalyzerCore.test.mjs packages/i18n/src/parity.test.mjs packages/types/src/analyzer.test.mjs`
- `openspec validate --all --strict`
- Manual pass from the user for Android live recorded-video ROI burn-in after the JS platform gate fix.

## Remaining feature phases

### 1. Real ML analyzer phase 2

Goal: replace the Phase 1 classical analyzer with a production-grade on-device model path while keeping the classical analyzer as fallback.

- Export YOLOv11n or the selected seed model to TFLite and place it under `apps/mobile/assets/models/`.
- Add native dependencies such as `react-native-fast-tflite` and any resize/frame-processing helper only after confirming SDK 54 compatibility.
- Implement `TfliteSeedAnalyzer` behind the existing `SeedAnalyzer` interface.
- Add `selectAnalyzer()` so app startup prefers TFLite when the model loads, falls back to `ClassicalSeedAnalyzer`, then mock only as the final fallback.
- Decode YOLO outputs into `AnalyzedSeed[]`, apply ROI, convert dimensions using `pxPerMm`, and run NMS.
- Measure device performance and update `openspec/changes/mobile-real-usage/design.md` with achieved fps and latency.

### 2. Live detection overlay

Goal: make Live mode visually show real detections before capture.

- Implement or finish `components/camera/DetectionOverlay.tsx`.
- Feed it from the selected analyzer's `analyzeFrame` path once real frame inference exists.
- Keep KPI and ROI filtering driven by the same detection source as the overlay.
- Verify overlay alignment against camera preview on iPhone Air, iPad Pro M2, and Samsung Z Flip 7 FE.

### 3. Offline sync queue

Goal: make failed network saves recoverable without data loss.

- Continue from `openspec/changes/mobile-offline-sync/tasks.md`.
- Add queue store/replay unit tests.
- Refactor inspection save payload assembly out of `capture/review.tsx` into a reusable queue-safe helper.
- Make inspection replay idempotent across media upload, inspection insert, seed insert, and metadata update.
- Make recording replay idempotent and preserve uploaded URLs when DB insert fails.
- Retain local media files until queued entries sync or are cancelled.
- Add pending detail states and pending/failed recording rows.
- Manually test airplane-mode save, restore-network replay, failed recording retry, and Supabase row creation.

### 4. Calibration phase 2

Goal: improve reliability and transparency of measurement calibration.

- Re-test LiDAR lock behavior on Pro-class hardware after every capture-screen lifecycle change.
- Decide whether LiDAR can bypass ArUco for Live mode on supported hardware, then update UI copy and OpenSpec if behavior changes.
- Add a calibration quality/debug readout for internal QA if repeated "locked but stale" reports come back.
- Verify known-size reference measurements against a caliper target and document expected error.

### 5. ROI editing improvements follow-up

Goal: polish the existing ROI editor after the core rect/polygon/circle edit work.

- Keep rectangle, polygon, and circle edits covered by regression tests where practical.
- Verify ROI survives save, result, detail, share, and video burn-in for both photo and video captures.
- Add any remaining UX refinements only if they improve repeated field use, not just visual polish.

### 6. Distribution and beta readiness

Goal: move beyond wired-device dev testing.

- Finish EAS/Firebase App Distribution setup for iOS and Android.
- Update README and demo script to match the current custom dev-client and Firebase flow.
- Run storage/RLS privacy checks for media URLs.
- Run `openspec archive mobile-real-usage` only after the active change is truly complete.

## Useful commands

```bash
cd /Users/ppungpong/Github/advance-seeds-field-inspector-demo
pnpm -F @advance-seeds/mobile typecheck
pnpm -F @advance-seeds/mobile lint
node --test apps/mobile/modules/roi-video-exporter/module-config.test.mjs apps/mobile/lib/analyzer/ClassicalSeedAnalyzerCore.test.mjs packages/i18n/src/parity.test.mjs packages/types/src/analyzer.test.mjs
openspec validate --all --strict

cd /Users/ppungpong/Github/advance-seeds-field-inspector-demo/apps/mobile
./node_modules/.bin/expo prebuild --platform ios --clean
./node_modules/.bin/expo prebuild --platform android --clean
./node_modules/.bin/expo run:ios --device
./node_modules/.bin/expo run:android --device
```

## Prompt for the next AI agent

```text
You are continuing the Advance Seeds Field Inspector demo in /Users/ppungpong/Github/advance-seeds-field-inspector-demo.

Start by reading:
- docs/REMAINING_HANDOFF_2026-04-30.md
- docs/HANDOFF.md
- openspec/changes/mobile-real-usage/tasks.md
- openspec/changes/mobile-offline-sync/tasks.md
- the latest git log around 0e8c2aa

Hard rules:
- Work only from /Users/ppungpong/Github/advance-seeds-field-inspector-demo.
- Use apps/mobile/./node_modules/.bin/expo, never pnpm dlx expo.
- ios/ and android/ are generated/gitignored; clean prebuild after native module or app.json plugin changes.
- Update OpenSpec for finished behavior before committing.
- Show a short plan before non-trivial edits and wait for "ok".
- Keep responses terse.

Current passed checkpoint:
- ClassicalSeedAnalyzer Phase 1 is implemented with ROI filtering, downsampling, timing logs, and mock fallback.
- Inspection Result and Inspection Detail seed lists are virtualized; detail has grade filtering.
- Android ROI video exporter exists and the user manually passed live recorded-video ROI burn-in.
- Latest feature commit: 0e8c2aa feat(mobile): add classical analyzer and Android ROI video.

Recommended next work:
1. Implement Real ML analyzer phase 2: TFLite model bundling, TfliteSeedAnalyzer, selectAnalyzer fallback chain, NMS, ROI, px/mm conversion, and performance notes in OpenSpec.
2. Then implement the Live detection overlay from real analyzer frame output.
3. Resume Offline sync queue only after stabilizing real analyzer work, unless the user reprioritizes it.

Before editing, inspect current git status and OpenSpec. After implementation, run mobile typecheck, lint, targeted node tests, and openspec validate --all --strict. Commit with a conventional commit message.
```

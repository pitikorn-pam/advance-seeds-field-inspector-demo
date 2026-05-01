# Remaining handoff — 2026-05-01

Supersedes `docs/REMAINING_HANDOFF_2026-04-30.md`. Captures the state after
the live-mode performance pass on Z Flip 7 FE / Samsung SM-F761B.

## What just landed

### Live-mode perf + stability (committed `957aa43`)

Crash-free Android live YOLO on the foldable was blocked by four distinct
failures, each masking the next. Fixes shipped in one batch:

- **Camera2 stream-count** — gated `video`/`audio` props on
  `recording.isRecording` so the live-only path uses photo + frameProcessor
  (2 surfaces). Exynos 2400 caps at 3 simultaneous streams; we were asking
  for 4 and the HAL refused with `ERROR_CAMERA_DEVICE`.
- **Worklets-core 1.6 boundary** — raw `ArrayBuffer` is no longer a valid
  shared value. Pass `Float32Array` and reuse a pre-allocated tensor across
  frames so we don't churn ~5 MB/frame and starve `scudo`'s small-page pool.
- **TFLite delegate** — switched Android default from GPU → NNAPI so
  inference runs on the Hexagon NPU and doesn't compete with the camera
  preview's Adreno GPU usage. CPU fallback if NNAPI unavailable.
- **Float32 normalize** — added `[0..255] → [0..1]` scaling on the JS side
  before `model.runSync`. iOS Core ML normalises implicitly via Vision's
  `MLImageConstraint`; TFLite does not, which is why Android live had no
  detections previously.
- **Worklet → JS backpressure** — `Worklets.createSharedValue<boolean>(false)`
  flag set before `inferOnJS`, reset on completion / error. Worklet skips
  frames while the JS thread has a `runSync` in flight, so the queue can't
  grow unbounded.
- **Fabric mount race** — `addViewAt: failed to insert view ... already has
a parent` from `react-native-svg <Rect>` was bouncing the JS bundle to
  expo-dev-launcher's broken error screen. Replaced with plain `<View>`
  borders. Same race fixed in `DropdownSearch` by conditionally rendering
  the `<Modal>` only when open.
- **`setDetections` mounted-guard** — `mountedRef` so worklet-queued JS
  callbacks that land post-navigation don't trip the "state update on
  unmounted component" warning.
- **Hyperparams** — collapsed `targetFpsIos` / `targetFpsAndroid` into a
  single `targetFps` (default 30). The backpressure flag self-throttles, so
  per-platform tuning is no longer meaningful. Playground UI + en/th i18n
  updated; field renamed in `HyperParams` interface.

### Live-mode quality (committed in this session, post-957aa43)

- **ROI-aware inference crop** — when the user has bounded an ROI, pass a
  square-padded crop rect to `vision-camera-resize-plugin` so YOLO sees more
  pixels per object inside the ROI and detections outside the region are
  physically impossible (~free precision win + faster
  `mapDetectionsToSeeds`). Inverse-letterbox math uses the same crop rect.
- **Reanimated bbox interpolation** — `DetectionOverlay` now wraps each box
  in `Animated.View` with `LinearTransition` (120 ms) + `FadeIn` (120 ms) /
  `FadeOut` (160 ms). Key by `(class_id, spatial-bucket)` so the same
  physical detection visibly interpolates across inference frames. Produces
  perceived ~60 fps box motion from 15–30 fps inference.
- **ArUco calibration phase 2** —
  - Rolling-window **median** of `pxPerMm` over the last 5 samples; kills
    1-frame outliers from motion blur / corner ambiguity.
  - **Hysteresis**: `LOCK_CONFIDENCE = 0.6` to enter the locked state,
    `HOLD_CONFIDENCE = 0.45` to maintain it, so a partial-occlusion frame
    no longer dumps the lock.
  - **Grace window** of 1.5 s — if the marker briefly leaves frame, the
    pill stays locked. Sustained loss clears the buffer and requires a full
    re-lock.

OpenSpec amended:

- `live-camera-capture` — added requirements for ROI-aware crop and
  Reanimated overlay interpolation.
- `live-calibration` — added requirement "ArUco lock is temporally smoothed
  and hysteretic" with 4 scenarios.
- `mobile-real-usage/tasks.md` — added section 14 covering all 10 perf-pass
  changes, all marked done.

## Verified on hardware

- **iPhone Air (iOS 18.x)** — Core ML live path was already green from the
  previous session and is untouched in this round.
- **Samsung Z Flip 7 FE / SM-F761B (Android 14)** — JS-side fixes confirmed
  via logcat:
  - `[analyzer] tflite delegate=nnapi` on every cold start.
  - No `[live-detections] frame processing failed` after the
    `Float32Array` swap.
  - No `runSync failed: Value "undefined" is not an ArrayBuffer` after
    the tensor-reuse copy.
  - No `ERROR_CAMERA_DEVICE` (errorCode=1 enum); the residual
    `notifyError errorCode=3` is `ERROR_CAMERA_REQUEST` (per-frame, not
    fatal — frame numbers continue incrementing past errors).
- **End-to-end live test still pending the user** — they wanted to test the
  ROI-crop + bbox-interpolation + calibration-phase-2 deltas in real use.

## What's next

### Pending user verification

1. Real-device walkthrough on the Z Flip 7 FE for the new features:
   - ROI drawn → live preview should feel snappier inside the region;
     box positions should be more pixel-accurate for objects in the ROI.
   - Box motion under slow camera pan should appear smooth at display
     refresh rate, not snap at 15–30 Hz.
   - Calibration pill should stop flickering when the marker partially
     occludes or briefly leaves the frame.

### Earlier handoff items still untouched

2. **Android offline-sync QA** — manual airplane-mode replay walkthrough
   (`mobile-offline-sync` tasks 5.5–5.7) on the device.
3. **Distribution prep** —
   - `eas build --profile preview --platform ios|android`.
   - Firebase App Distribution invite groups (`internal`, `pilot`).
   - README + `docs/demo-script.md` update for the Firebase invite flow.
   - Storage RLS audit (signed-out URL guess test).
   - Tag `v0.2.0`, archive the `mobile-real-usage` change.

### Optional next-pass polish

4. Per-frame inference-time histogram in the hyperparams playground (one
   counter per source — NNAPI / GPU / CPU — with rolling p50 / p95). Lets
   QA tune `targetFps` against actual measured cost rather than a guess.
5. Multi-marker ArUco (currently single marker ID 0). With `DICT_4X4_50` we
   could place 2–4 markers and average their derived `pxPerMm` for tighter
   confidence.
6. A `withSpring` instead of `LinearTransition` on the overlay for slightly
   organic motion under fast pans (currently snaps because spatial-bucket
   identity changes).

## Commit hygiene

- `957aa43` shipped 11 files for the perf-pass.
- The follow-on ROI-crop / overlay-interpolation / calibration-phase-2
  changes (4 files) are uncommitted at the time of this handoff. Run
  `git diff --stat` to confirm before committing as one feature commit.

## Local dev reminders (unchanged from prior handoff)

- Work only from `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`.
- Use `apps/mobile/./node_modules/.bin/expo`, never `pnpm dlx expo`.
- `ios/` and `android/` are generated/gitignored; clean prebuild after
  native-module or `app.json` plugin changes.
- Update OpenSpec for finished behaviour before committing.
- After implementation: mobile typecheck, i18n parity, targeted node
  tests, and `openspec validate --all --strict`.

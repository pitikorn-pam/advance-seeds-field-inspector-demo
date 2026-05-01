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

### Live-mode polish (committed in this session, post-6e4ff78)

- **Inference-time histogram** — every analyzer path now calls
  `recordInference(source, ms)` after each `runSync` / plugin call. The
  hyperparams playground renders rolling **p50 / p95 / p99 + bucket
  histogram** per delegate (`coreml`, `tflite-nnapi`, `tflite-android-gpu`,
  `tflite-cpu`). Lets QA tune `targetFps` against measured cost rather
  than a guess. Updates coalesce at 200 ms so the playground doesn't
  re-render at inference rate.
- **Spring-physics overlay** — `DetectionOverlay` swapped
  `LinearTransition.duration(120)` for
  `LinearTransition.springify().damping(18).stiffness(160).mass(0.4)`.
  Boxes now have a slight settle when tracking motion rather than the
  mechanical linear ease.
- **Multi-marker ArUco** — both Android Kotlin and iOS Obj-C++ native
  paths now compute `pxPerMm` for every detected marker, surface a
  `multiMedianPxPerMm` + `markerCount`, and boost confidence by 0.05 per
  extra marker (capped at 1.0). JS prefers the median when `count > 1`.
  Wire format extended from 6-tuple → 8-tuple; older JS bundles ignore
  the trailing fields gracefully.
- **Native rebuild required** — the multi-marker change touches Android
  Kotlin and iOS Obj-C++. Android already rebuilt as part of this commit
  (`expo run:android` against the Z Flip 7 FE). iOS rebuild needed when
  next testing on the iPhone Air.

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

## Open issues

### 🔴 Android live preview stutters when objects are detected (still open)

The reproduction is: open Inspect → Precise (or Live) on the Z Flip 7 FE,
let calibration lock, point the camera at an object the model recognises.
The preview goes laggy and the bounding boxes don't update smoothly. iOS
is unaffected.

Things attempted today, none of which fully resolved it:

- ROI-aware crop (less work per inference, but not the bottleneck).
- Reanimated layout animations gated to iOS (avoids Fabric race).
- Pre-allocated tensor reuse (kills scudo allocator churn).
- Render throttle 50 ms (decouples React rate from inference rate).
- Worklet → JS backpressure via `Worklets.createSharedValue<boolean>` so
  at most one inference is in flight.
- Camera2 stream count gated to 2 (photo + frameProcessor).
- TFLite Android delegate bumped to NNAPI (frees Adreno GPU for preview).
- SVG bounding boxes replaced with plain `<View>` borders.
- `react-native-svg` 15.12 → 15.15.4 for Fabric mount-race fixes.
- Inspect tab routing changed from `useFocusEffect + router.replace` to
  `<Redirect>` (atomic, no double-mount).
- `model.runSync` → `model.run` (async, off JS thread).
- Atomic check-then-set of `inFlight.value` _before_ `resize()` is called
  in the worklet.
- Camera native delivery rate constrained to **30 fps via `useCameraFormat` +
  `fps={30}`** on the `<Camera>` instance (Vision Camera was passing through
  the device's native 60 fps under the hood, doubling pool pressure).

The smoking-gun log line during the stutter is:

```
W ImageReader_JNI: Unable to acquire a buffer item, very likely client tried
                    to acquire more than maxImages buffers
E ImageAnalysisAnalyzer: java.lang.IllegalStateException: maxImages (6) has
                          already been acquired, call #close before acquiring more.
```

CameraX's `ImageAnalysis` stage has a hardcoded buffer pool of 6 ImageProxy
slots. Vision Camera doesn't expose the pool size. Sustained pool overflow
stalls the camera HAL → preview goes still → bounding boxes appear "stuck".
The 30 fps cap shipped at end of the prior session. Follow-up verification
confirmed the Camera2 session was requesting 30 Hz (`aeTargetFpsRange [30 30]`,
`frameDuration 33333000`) and `dumpsys media.camera` showed
`Camera error traces (0)`. A focused logcat window after foregrounding the app
showed repeated `[analyzer] selected tflite-yolo` and no `maxImages` /
`ImageAnalysisAnalyzer` errors, but a sustained hand-held object-detection
walkthrough is still needed before closing this issue.

Latest follow-up fix:

- Legacy/default live hyperparam `targetFps` lowered from 30 → 15 via
  `advance-seeds.hyperparams.v2`; legacy v1 persisted values at 30+ migrate to
  15 so existing devices do not keep the old high-pressure inference rate.
- Android live resize output changed from `Float32Array` to `Uint8Array`.
  The worklet-to-JS payload for 640×640 RGB drops from ~4.9 MB to ~1.2 MB;
  JS still fills the reusable normalized Float32 tensor before `model.run()`.
  This reduces the time the worklet spends copying while CameraX is waiting
  for the `ImageProxy` to be released.
- Follow-up Z Flip 7 FE logs while ArUco + YOLO were active did not show the
  old `maxImages (6)` exception, but Camera2 still emitted repeated
  `notifyError errorCode=3` and
  `FrameProcessorBase: Error waiting for new frames: Connection timed out
(-110)`. `dumpsys media.camera` and `ResizePlugin` logs showed the frame
  processor still receiving 1920×1080 and converting the full YUV frame to
  ARGB before cropping to 1080×1080 and scaling to 640×640.

2026-05-02 follow-up:

- The unconditional Android FHD/60 camera request regressed camera startup on
  the Z Flip 7 FE when Vision Camera selected an FHD format whose supported
  range did not include 60. Logcat showed `format/invalid-fps` followed by
  `CameraView: invokeOnAverageFpsChanged(0.0)`.
- `Viewfinder` now still prefers 60 fps on Android, but clamps the `fps` prop
  to the selected format's `minFps...maxFps` before mounting `<Camera>`. This
  preserves FHD/60 on devices/formats that support it and falls back to FHD/30
  instead of failing the camera session.
- Follow-up logcat showed native CPU inference at 1920x1080 input delivery
  taking about 980-1022 ms per frame (`AdvanceSeedsTFLite: native live
inference ... elapsed=979ms/1022ms delegate=cpu`). That is roughly 1 fps,
  so 30 fps live inference is not achievable on the current CPU YOLO11n 640
  pipeline without a faster delegate/model/input profile.
- Live detection results now carry actual native frame dimensions. Capture
  screens use those dimensions for DetectionOverlay and KPI ROI projection
  instead of hard-coded 1920x1080, which could make boxes project incorrectly
  or off-stage when CameraX selected a different stream size.
- Android live YOLO now uses a low-pressure camera profile while the frame
  processor is attached: `Viewfinder` requests 1280x720 / 30 fps and the
  Android native YOLO hook caps inference requests to 5 fps. This is a
  stability fallback for the measured CPU inference path; it does not make the
  model capable of 30 fps inference, but it prevents the app from
  over-requesting inference while preview responsiveness is the priority.
- The native Android TFLite plugin now has an experimental GPU promotion path.
  On the first prepared frame it benchmarks CPU/XNNPACK and GPU when the
  device reports GPU delegate compatibility, selects GPU only if it completes
  faster, and falls back to CPU on setup/runtime failures. Logs now report
  `delegate=cpu` or `delegate=gpu`; JS inference stats record GPU samples under
  `tflite-android-gpu`.
- Z Flip 7 FE verification on 2026-05-02 reported `gpu delegate not supported
on this device`, so the native live path remained CPU/XNNPACK. The 1280x720
  crop inference improved to ~166-196 ms, but synchronous frame processing
  still pulled CameraView average FPS toward ~5 fps. Follow-up patch dispatches
  the heavy native TFLite call through Vision Camera `runAsync(frame, ...)` so
  preview frames are not blocked while CPU inference self-drops when busy.
- Android annotation root cause: the TFLite NMS output reports normalized
  `x1,y1,x2,y2` values in `0..1`, while the shared decoder had assumed
  640-pixel coordinates. The decoder now detects normalized NMS rows and scales
  by the model input size before projecting boxes to the camera frame. Android
  native live also caps its effective score threshold at 0.25 because the
  TFLite export produced lower confidence than the iOS Core ML path for the
  same Banana target.
- Android `Viewfinder` now requests a lower-pressure Camera2 stream:
  1280×720 / 30 fps via `useCameraFormat` + `fps`. iOS remains at
  1920×1080 / 30 fps for the Core ML path.
- Device verification showed 1280×720 / 15 fps did take effect, but the
  `maxImages (6)` overflow still recurred as soon as object detection
  started. Follow-up patch now disables `photo` while Android live YOLO owns
  the frame stream, detaching the ImageCapture surface during sustained
  analysis. Shutter sets `busy`, removes the frame processor, re-enables
  `photo`, waits briefly for CameraX to reconfigure, then calls `takePhoto`.
- Follow-up after detaching ImageCapture: `dumpsys media.camera` confirmed only
  two active streams while live YOLO was active (`SurfaceTexture-...`
  preview + `ImageReader-1280x720...`, `aeTargetFpsRange [15 15]`), but the
  preview still stalled with repeated `notifyError errorCode=3` /
  `FrameProcessorBase` timeouts. The old `maxImages` exception was absent in
  this sample. `ResizePlugin` work took only a few ms, while live NNAPI
  inference appeared to stay in flight for ~13-second intervals. Android
  TFLite now defaults to CPU to avoid competing with Samsung camera HAL
  AI/ISP resources on NNAPI/GPU.
- Native Android live YOLO now owns the live path via Vision Camera plugin
  `advanceSeedsRunTFLite`: the plugin samples YUV directly into the TFLite
  input tensor and only returns output values/shape to JS. Follow-up smoothness
  patch removes per-pixel allocation in the Kotlin YUV→RGB loop, caches crop
  coordinate maps, migrates default `targetFps` back to 30 via
  `advance-seeds.hyperparams.v3`, and requests Android FHD/60 preview while
  keeping inference throttled separately.

**Next steps when resuming:**

1. Rebuild/install the native Android dev client, then run a sustained Z Flip
   7 FE walkthrough on the patched bundle:
   Inspect → Precise/Live → calibration lock → recognizable object in frame
   for 20–30 s, while watching logcat for `maxImages`,
   `ImageAnalysisAnalyzer`, `notifyError errorCode=3`, and
   `FrameProcessorBase` timeouts. Confirm `dumpsys media.camera` shows no
   ImageCapture stream while Android live YOLO is active, and that shutter
   still captures after the brief CameraX reconfigure wait. Confirm Camera2
   accepts FHD/60 or the nearest supported FHD range, native logs show
   `AdvanceSeedsTFLite ... delegate=cpu`, and native elapsed timings are
   stable after the allocation fix.
2. If still overflowing, the remaining levers are:
   - **Benchmark native delegate promotion** (NNAPI / GPU) behind a hardware
     gate. Keep CPU as the stable default on Samsung until the native plugin
     proves the camera HAL no longer times out at FHD/60 preview + 30 fps
     inference.
   - **Dynamic camera profiles**: if FHD/60 still stalls on a device after the
     native plugin, fall back at runtime to 720p/15 and surface that the
     device could not sustain the requested live-analysis profile.

### 🟡 Android offline-sync QA still pending

Manual airplane-mode replay walkthrough (`mobile-offline-sync` tasks 5.5–5.7)
not validated on this device.

## What's next

### User-driven (today's focus)

**Firebase App Distribution flow** — the user is taking over this:

```bash
# 1. Build a fresh preview APK on EAS (~10-15 min, runs in cloud).
pnpm -F @advance-seeds/mobile build:preview:android

# 2. Distribute the latest finished build to the `internal` group.
#    Wait until step 1 finishes; the script reads from EAS build:list.
pnpm -F @advance-seeds/mobile dist:android

# 3. Promote the same APK to the pilot group when ready.
FIREBASE_GROUPS=pilot pnpm -F @advance-seeds/mobile dist:android
```

All three commands work as-is with the current commit. **Before running
step 3 the `pilot` tester group needs to exist in Firebase** — App
Distribution → Testers & groups → Add group → alias `pilot`. Otherwise
step 3 fails with the clarified error message (HTTP 404 → "Group `pilot`
not found in Firebase. Create it under...").

Step 1's first run uploads ~30 MB now (was ~290 MB before this session's
`.easignore` shipped — `ios/` and `android/` are excluded so EAS regenerates
them via CNG on the build worker).

### Pending after Firebase work

1. Real-device walkthrough on the Z Flip 7 FE to confirm whether the
   `fps={30}` cap resolved the live-preview stutter (see Open Issues).
2. **Android offline-sync QA** — manual airplane-mode replay walkthrough.
3. Tag `v0.2.0`, archive the `mobile-real-usage` change.

### Optional next-pass polish

(All deferred — none currently blocking.)

- Multi-marker ArUco upgrade (native + JS already shipped at commit
  `f7c9001`; only the **multi-marker calibration-card design** is missing,
  user can place a single 5 cm card and ignore the multi-card path).
- `withSpring` overlay transitions for organic motion under fast pans.
- Inference-time histogram already shipped (commit `f7c9001`).

## Commit hygiene

- Today's commits, newest first:
  - `f7c9001` live-mode polish (inference timings, spring overlay, multi-marker ArUco)
  - `6e4ff78` live-mode quality pass (ROI crop, bbox interpolation, calibration smoothing)
  - `957aa43` unblock Android live detection (Camera2 streams, NNAPI, Fabric)
  - `92f4d1b` video captures produce real seed analysis + back-button fix
  - `d28c5c1` EAS upload trim + Firebase App Distribution runbook
- The next commit (closing this session) bundles: `<Redirect>` atomic
  inspect routing, `react-native-svg` bump to 15.15.4 + native rebuild,
  `expo-video-thumbnails` linked, `model.run` async, atomic `inFlight`
  check-then-set, Camera native fps cap at 30 via `useCameraFormat`, and
  the Firebase script's "group not found" hint.

## Local dev reminders (unchanged from prior handoff)

- Work only from `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`.
- Use `apps/mobile/./node_modules/.bin/expo`, never `pnpm dlx expo`.
- `ios/` and `android/` are generated/gitignored; clean prebuild after
  native-module or `app.json` plugin changes.
- Update OpenSpec for finished behaviour before committing.
- After implementation: mobile typecheck, i18n parity, targeted node
  tests, and `openspec validate --all --strict`.

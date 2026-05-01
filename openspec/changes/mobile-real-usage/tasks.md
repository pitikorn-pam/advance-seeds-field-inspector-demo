# Tasks — Mobile Real Usage

## 1. Distribution & dev-client foundation

- [ ] 1.1 Start Apple Developer Program enrollment (iPassion org; in progress)
- [ ] 1.2 Create a Firebase project for App Distribution; install `firebase-tools` CLI (deferred until first preview build)
- [x] 1.3 Install `eas-cli` (global, v18.8.1); EAS init deferred to first build run
- [x] 1.4 Author `apps/mobile/eas.json` with `development`, `preview`, `production` profiles
- [ ] 1.5 Run `eas build --profile development --platform ios` once → install dev client on iPhone Air (waits for Apple cert)
- [ ] 1.6 Run `eas build --profile development --platform android` → install dev client on Z Flip 7 FE
- [x] 1.7 Update `apps/mobile/app.json` plugin list to include the dev-client plugin and reserve room for camera + photo library permission strings (`NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`, `android.permission.CAMERA`, `android.permission.RECORD_AUDIO`)
- [x] 1.8 Document the Firebase invite flow + dev-client install flow in root `README.md`

## 2. Camera migration (Vision Camera, mock analyzer still)

- [x] 2.1 Remove `expo-camera` (was never installed); install `react-native-vision-camera`
- [x] 2.2 Add the camera config plugin to `app.json` with iOS + Android permission strings
- [x] 2.3 Build `components/camera/Viewfinder.tsx` — fullscreen camera preview with safe-area handling
- [x] 2.4 Build `components/camera/ShutterBar.tsx` — shutter / flip / flash / grid actions
- [x] 2.5 Add the glass-style top bar (back button, mode pill, action button) per prototype
- [x] 2.6 Capture flow `app/capture/setup.tsx` — variety, batch, mode picker (live / precise)
- [x] 2.7 `app/capture/scan.tsx` — viewfinder rendering live preview (no detection yet)
- [x] 2.8 `app/capture/precise.tsx` — viewfinder with crosshair brackets and "Hold steady" guidance
- [x] 2.9 Shutter capture: high-res photo to a local temp file via `useCameraDevice` + `takePhoto`
- [x] 2.10 Upload captured photo to Supabase Storage (`inspection-images/<uuid>.jpg`) before navigating to processing
- [x] 2.11 Permissions flow: pre-flight check on first capture; deep link to Settings if denied

## 3. SeedAnalyzer interface evolution (BREAKING)

- [x] 3.1 Edit `packages/types/src/analyzer.ts` — add `analyzeFrame(frame, options)` and supporting `Frame`, `AnalysisFrameResult` types (also added `LiveCalibrator` + `CalibrationReading` per D3)
- [x] 3.2 `MockSeedAnalyzer` adds an `analyzeFrame` impl emitting deterministic detections every ~200 ms (with sinusoidal bbox drift for live feel)
- [x] 3.3 Bump `@advance-seeds/types` to 0.2.0; consumers in dashboard + mobile typecheck without changes (dashboard doesn't use frames; mobile reuses the new types)
- [x] 3.4 Add a unit test for `analyzeFrame` shape conformance (frame ref → result with bbox array) — `packages/types/src/analyzer.test.mjs`

## 4. Real analyzer

- [x] 4.0 Phase 1 classical analyzer: decode captured JPEGs, segment seed-like blobs, apply ROI, convert pixel dimensions to mm, and keep mock fallback for failed decode/segmentation
- [x] 4.0a Cap classical analyzer pixel workload before segmentation and log decode/analyze timing for device tuning
- [x] 4.0b Android ROI video exporter: burn Rect/Polygon/Circle ROI into recorded Live videos before upload/share/detail playback
- [x] 4.0c Result/detail performance pass: virtualize the Inspection Result seed list and Inspection Detail seed grid; add grade filtering on detail
- [ ] 4.1 Export YOLOv11n to TFLite via Ultralytics CLI: `yolo export model=yolo11n.pt format=tflite imgsz=640` (placeholder file shipped at `assets/models/yolo11n-seeds.tflite`; user-supplied real export still pending — see `assets/models/README.md`)
- [x] 4.2 Place the resulting `yolo11n.tflite` at `apps/mobile/assets/models/yolo11n-seeds.tflite` (placeholder in place; replace with real export to activate Tflite path)
- [x] 4.3 Install `react-native-fast-tflite` and `vision-camera-resize-plugin`; metro `assetExts` includes `tflite`; CoreML + Android GPU delegates enabled via `app.json` plugin
- [x] 4.4 Build `lib/analyzer/TfliteSeedAnalyzer.ts` for the single-shot photo path (letterbox → runSync → decode → NMS → ROI/mm). `analyzeFrame` returns null for now and is wired in Phase 6.1 once `DetectionOverlay` lands.
- [x] 4.5 Decode YOLO output: anchor-free `[1, 4+numClasses, anchors]` head → bounding boxes in original-image space; NMS (IoU 0.45) + score threshold 0.25; mapped to `AnalyzedSeed[]` with px/mm conversion. Pure helpers in `lib/analyzer/yolo.ts` covered by `yolo.test.mjs` (letterbox, decode, NMS, mapping + ROI).
- [x] 4.6 `lib/analyzer/selectAnalyzer.ts` runtime picker: Tflite → Classical → Mock fallback chain, tolerant of a missing/invalid model file.
- [x] 4.7 Wire the picker through `AnalyzerProvider` (renders Classical immediately, swaps to selected analyzer on settle); dev-mode warning removed.
- [x] 4.7a Live worklet path: `lib/analyzer/useLiveDetections.ts` runs `model.runSync` on the **JS thread** via `Worklets.createRunOnJS`, with the worklet thread handling only the resize-plugin step. Earlier worklet-thread inference crashed with "Cannot get hybrid property HybridTfliteModelSpec.outputs" because Vision Camera serialized the captured `model` HybridObject across threads on every frameProcessor render and the prop walk fired the `outputs` getter on a fast-refresh-stale instance. Splitting the model out of the worklet closure (model lives in a JS-thread ref; only ArrayBuffers cross threads) eliminates the walk; cost is one bridge hop per ≤5 fps frame, negligible for the live KPI strip. Active once calibration locks (the existing aruco frame processor owns the stream until then). Buffer hop now uses `resized.slice().buffer` so worklets-core can structured-clone the payload — the previous `frame processing failed {}` warn from passing the worklet-owned buffer directly is gone.
- [x] 4.7e iOS Core ML single-shot path: `lib/analyzer/CoreMLSeedAnalyzer.ts` runs YOLO26 via the `@advance-seeds/coreml-runner` Expo Module (Swift, wraps `MLModel.prediction` with image input). On iPhone Air the single-shot total dropped from ~8.8 s (TFLite + JS jpeg-js decode of 4k photo) to ~110 ms (ANE-accelerated CoreML). `selectAnalyzer` prefers CoreML on iOS, TFLite on Android. Source-image dims come from `Image.getSize` so the letterbox-inverse decoder lands boxes in source-image pixel space and the session ROI math stays correct. `.mlmodelc` (4.9 MB) ships as a pod resource via the module's podspec.
- [x] 4.7f iOS live worklet via Core ML: new Vision Camera frame-processor plugin `advanceSeedsRunCoreML` (Obj-C++ in the same `coreml-runner` module, registered via `VISION_EXPORT_FRAME_PROCESSOR`). Inference runs on the worklet thread via `VNCoreMLRequest` against the cached `MLModel`; only the decoded output values cross to JS via `runOnJS`. `useLiveDetections` platform-branches: iOS uses the plugin, Android keeps TFLite + JS-thread inference. Eliminates the Float32-buffer hop from the resize-plugin path on iOS.
- [x] 4.7b Capture-class master data: `varieties.coco_class_id`, `ref_length_mm`, `ref_width_mm` columns added by migration `20260430000001_varieties_capture_classes.sql`, plus a Settings → Master data → Capture classes screen for editing. Live + single-shot analyzers source `classFilter` from the inspected variety, falling back to `DEFAULT_CAPTURE_CLASS_IDS` (banana/apple/orange/broccoli/carrot) when a variety has no mapping.
- [x] 4.7c Hyperparameters: `SCORE_THRESHOLD = 0.5`, `IOU_THRESHOLD = 0.75` for the YOLO11/8 raw head; YOLO26 NMS-baked head uses the model's built-in NMS and the score threshold only.
- [x] 4.7d YOLO26n weights: bundled `apps/mobile/assets/models/yolo11n-seeds.tflite` is now a YOLO26n float16 export. Output shape `[1, 300, 6]` (built-in NMS) is decoded by `decodeYoloNms` in `lib/analyzer/yolo.ts`; the analyzer auto-detects raw vs nms output kind at load time.
- [x] 4.8 Performance target: ≥ 5 fps on iPhone 12 baseline; documented in `design.md` D9a. iPhone Air (Apple Neural Engine) measurements: single-shot Core ML 18–30 ms inference / 53–65 ms total (vs 8822 ms with the legacy TFLite + jpeg-js path); live worklet has 5–10× headroom over the 5 fps budget. Goal hit comfortably.

## 5. Live calibration

- [x] 5.1 Add `LiveCalibrator` interface to `@advance-seeds/types`
- [x] 5.2 `lib/calibration/ManualCalibrator.ts` — returns the user's selected calibration profile's `pxPerMm` constant
- [ ] 5.3 `lib/calibration/ArucoCalibrator.ts` — frame processor plugin running an OpenCV ArUco detector; native bridge
  - [x] Captured-photo ArUco bridge is wired into `capture/processing`: if a DICT_4X4_50 marker is visible in the saved image, analysis uses the detected px/mm instead of the manual fallback.
  - [x] Live iOS frame-processor ArUco readings are wired through Vision Camera on live and precise capture screens. The KPI and saved result metadata use the current ArUco reading once locked.
  - [x] Live Android frame-processor ArUco readings are wired through Vision Camera with the same plugin name and result contract as iOS.
- [x] 5.4 ArUco native module (iOS): wrap OpenCV's iOS framework via a small Swift Expo Module
- [x] 5.5 ArUco native module (Android): wrap OpenCV Android via a Kotlin Expo Module, including captured-image detection and live Vision Camera frame-processor detection.
- [x] 5.6 `lib/calibration/LidarCalibrator.ts` — iOS-only, uses ARKit `ARSession` + depth map for distance
- [x] 5.7 LiDAR native module (iOS): Swift wrapper exposing `currentDistanceMeters` and `pxPerMm` derived from sensor parameters
- [x] 5.8 Runtime picker: feature-detect LiDAR support, prefer LiDAR for precise mode, ArUco for live, fall back to Manual
- [x] 5.9 Calibration confidence threshold: < 0.6 reverts to manual + UI banner "Calibration unavailable — measurements may be approximate"
  - [x] Manual fallback is wired through `useCalibrator`, Live KPI analysis, processing analysis, result metadata, and detail metadata.
  - [x] Live/precise capture is gated by an ArUco confidence lock before photo or video capture starts, so saved inspections do not silently use a stale manual value.
  - [x] LiDAR confidence fallback is wired through `useLiveLidarCalibration`: readings below 0.6 are ignored and the banner falls back to the manual preview value.
- [x] 5.10 Author the printable ArUco reference card PDF at `docs/calibration/aruco-5cm.pdf`

## 6. Camera UI build-out (prototype fidelity)

- [x] 6.1 `components/camera/DetectionOverlay.tsx` — react-native-svg overlay drawing bounding boxes + class labels from `analyzeFrame` output. Wired into both `app/capture/scan.tsx` and `app/capture/precise.tsx`; renders only after calibration is locked (when the camera frame stream is owned by `useLiveDetections`). Skia version deferred — current SVG impl is performant enough for ≤ 5 fps inference.
- [x] 6.2 `components/camera/KpiStrip.tsx` — live "Count / Avg mm / Grade A%" pill bar bound to `useFrameTicker(analyzeFrame)`
- [x] 6.3 Calibration pill (`CalibrationPill.tsx`) + banner (`CalibrationBanner.tsx`) in glass style; LiDAR pill is feature-detected (won't show on iPhone Air or Z Flip 7 FE)
- [x] 6.4 Shutter haptic + capture animation (spring scale on press) + corrected live ring color (#DC2828)
- [x] 6.5 Precise mode: corner brackets, "Hold steady" guidance, distance indicator placeholder, calibration banner pinned to stage bottom (success ring lands once LiveCalibrator does — Phase 5)
- [x] 6.6 Test on iPhone Air and Z Flip 7 FE layouts during manual regression; folded/unfolded Android refinement remains normal QA if new layout bugs appear

## 6b. Flexible ROI tools

- [x] 6b.1 `components/camera/RoiToolbar.tsx` — picker for rectangle / polygon / circle / clear (plus a "Close" button shown when a polygon has ≥ 3 vertices)
- [x] 6b.2 Rectangle ROI: drag from one corner to the opposite (touch-down + drag + release commits). Re-edit by clearing + redrawing — handle-drag landing in a follow-up
- [x] 6b.3 Polygon ROI: tap to add vertex, "Close" toolbar button finalizes (replaces the spec's double-tap, which conflicts with the per-tap add-vertex gesture). Vertex handles draggable: deferred
- [x] 6b.4 Circle ROI: tap center, drag radius (radius normalized to min(width, height) so circles stay circles on portrait viewports). Center + edge handles deferred
- [x] 6b.5 SVG overlay (`react-native-svg`) renders the active ROI with semi-transparent brand-tint fill + 2 px stroke. Drafts (during drag) render the same way as committed; polygon drafts also show vertex dots
- [x] 6b.6 Point-in-shape predicates: `pointInRect`, `pointInPolygon` (ray-cast), `pointInCircle`. All in `lib/capture/roi.ts` with normalized [0..1] coords
- [x] 6b.7 KPI strip filters by ROI: when a committed shape is active, count / mean length / Grade-A% are computed over only the detections whose centroid (`normalizeCentroid`) falls inside the shape
- [x] 6b.8 Persist ROI shape on the captured inspection's metadata. Migration `20260427000002_inspections_metadata.sql` adds a generic `metadata jsonb` column with a `jsonb_typeof = 'object'` guard. `InspectionMetadata` type in `packages/types/src/domain.ts` documents the shape; review-screen save writes `{ roi: session.roi }` when a shape is active, and inspection detail surfaces an "ROI · Rect / Polygon (Nv) / Circle" badge.
- [x] 6b.9 ROI auto-clears on new session via the existing `session.reset()` after Save and sync — no separate reset path needed since ROI lives on the capture session
- [x] 6b.10 Rectangle ROI re-edit: committed rectangle exposes four corner handles; dragging any handle updates the existing ROI instead of forcing clear + redraw.
- [x] 6b.11 Polygon ROI re-edit: committed polygon exposes draggable vertex handles; dragging a vertex updates that point while preserving closure.
- [x] 6b.12 Polygon ROI edit actions: selected polygon supports adding a vertex on an edge and deleting a selected vertex while preserving a valid closed polygon with ≥ 3 vertices.
- [x] 6b.13 Circle ROI re-edit: committed circle exposes a center handle for move and an edge handle for radius resize.
- [x] 6b.14 ROI edit QA: verify rectangle, polygon, and circle edits update KPI filtering, save to inspection metadata, and render correctly on result/detail/share media.

## 7. Processing & review screens

- [x] 7.1 `app/capture/processing.tsx` — prototype-faithful: spinning brand orb + headline + 4-step checklist (captured/calibration/detected/grading) + "View results" CTA, gated on real upload+analyze completion
- [x] 7.2 `app/capture/review.tsx` — top bar (close + title + share), captured photo, GradeRing (SVG, % Grade A) + Total seeds + Avg dimensions, Per-seed list (grade pill + dims + chevron), Save draft + Save and sync
- [x] 7.3 Save flow: persist inspection + seeds rows; nav to inspection detail
- [x] 7.4 Discard flow: delete uploaded image from storage, return home
- [x] 7.5 Both screens follow the four-state pattern (loaded / loading / error)
- [x] 7.6 Result/detail note parity: setup notes persist to `inspections.notes` and render on both Inspection Result and Inspection Detail.
- [x] 7.7 Capture metadata: result/detail screens render compact collapsed metadata by default with Show more / Show less expansion.
- [x] 7.8 GPS auto-tag reliability: Save waits once for GPS when Auto-tag location is enabled, persists `location_capture_enabled`, and tolerates unavailable GPS.
- [x] 7.9 Reverse-geocoded location: GPS metadata stores a best-effort human-readable place/address label and falls back to coordinates when unavailable.
- [x] 7.10 Device/camera metadata: inspection metadata stores device name, platform/OS, app/build/runtime, capture mode, media type, camera position, flash mode, ROI type, and capture timestamp.
- [x] 7.11 Result/detail media parity: photo and video result/detail pages retain source media, note, metadata, ROI overlay where applicable, and share the correct media type.

## 7b. Video recording + in-session snapshots

- [x] 7b.1 Migration `20260427000001_recordings.sql`: `recordings` table (id, inspector_id FK, video_url, duration_ms, captured_at, notes), `recordings` storage bucket, RLS mirroring inspection-images
- [x] 7b.2 `lib/queries.ts` adds `useRecordings`, `useCreateRecording`, `useDeleteRecording` (mobile only). Delete also removes the storage object.
- [ ] 7b.3 `components/camera/RecordButton.tsx` — dedicated icon button deferred. ShutterBar's long-press is the primary entrypoint; a separate button is a small follow-up
- [x] 7b.4 `useRecordingState` hook (`lib/capture/recording.ts`) tracks { isRecording, durationMs }; ticker updates 10×/sec for the timer overlay
- [x] 7b.5 Vision Camera `startRecording` / `stopRecording`; explicit `fileType: "mp4"` + `videoCodec: "h264"`; vision-camera defaults handle preset + fps
- [x] 7b.6 Recording timer overlay (`components/camera/RecordingTimer.tsx`) — top of viewfinder, pulsing red dot + MM:SS
- [x] 7b.7 Upload to `recordings` bucket on stop via FormData; row inserted via `useCreateRecording`. Toast/progress: silent on success per spec ("show progress toast" mapped to a single saved-toast on success — full progress UI deferred)
- [x] 7b.8 Size guard: file > 100 MB after stop → alert with the limit. The "Save to Photos" branch is deferred until snapshot-to-Photos lands (needs `expo-media-library`); discard is the only recovery today
- [x] 7b.9 App-backgrounded > 2 s during recording → AppState listener auto-stops via `camera.stopRecording()`; existing `onRecordingFinished` callback uploads normally. Hard cap at 60 s also in place to keep files under the upload guard.
- [x] 7b.10 Snapshot button reuses `ShutterBar`'s existing `onSnapshot` slot rather than a new component — keeps the bar layout stable. Tap fires a low-haptic, takes a photo via the camera ref.
- [x] 7b.11 Snapshot saves the resulting URI via `MediaLibrary.saveToLibraryAsync` (no album, drops into Camera Roll on iOS / DCIM on Android).
- [x] 7b.12 First-time tap calls `MediaLibrary.requestPermissionsAsync()` for the system prompt; on denied, an Alert with cancel + Open Settings deep link (the system won't re-prompt after a previous deny).
- [x] 7b.13 New `components/ui/Toast.tsx` — a small fade-in/out pill anchored near the top of the viewfinder. Used by `setToast(t("…snapshot.savedToast"))`. Reusable for future "Recording uploaded" / similar acks.
- [x] 7b.14 Recordings list on `/profile` showing duration + captured-at + delete (no thumbnail yet — `expo-video-thumbnails` is another optional native dep, deferred)

## 8. Per-seed detail, variety detail, profile screens

- [x] 8.1 `app/seed/[inspection]/[index].tsx` — full screen with seed thumbnail placeholder, measurements (length/width/area/aspect/confidence), grade pill, edit/reject actions. Path uses both inspection-id + seed-index in the URL since seed-index alone isn't meaningful (deviates from spec's `app/inspections/seed/[index].tsx` for routing clarity)
- [x] 8.2 `app/varieties/[id].tsx` — hero image, scientific name, description, reference dimensions, recent-inspections summary (RLS-scoped via `useInspections` filter), "Start inspection" CTA pre-selects variety
- [x] 8.3 `app/profile.tsx` — standalone read-only profile: avatar (initials), name, role pill + email, three stat tiles, menu group (Settings, Sync, Help), Sign out
- [x] 8.4 Wire navigation: inspection detail → seed tile → `/seed/[inspection]/[index]`; varieties index → card → `/varieties/[id]`; settings → profile row → `/profile`

## 9. Onboarding

- [x] 9.1 `app/splash.tsx` — logo + tagline + 3 dots; auto-route to welcome after 1.5 s (or immediate on "Get started" tap). Only shown on first launch
- [x] 9.2 `app/welcome.tsx` — hero + headline + body + three feature cards (Camera / Target / Sync) + Continue → marks onboarded → /login
- [x] 9.3 Persist `as.mobile.onboarded` in AsyncStorage via `lib/onboarding.ts`; `StartupGate` reads it and skips splash/welcome on subsequent launches
- [x] 9.4 First-launch permission request: `VCCamera.requestCameraPermission()` fires from welcome's Continue. Best-effort — Continue proceeds whether granted or denied (capture/scan re-asks)

## 10. Theme tokens for camera surfaces

- [ ] 10.1 Add glass-style tokens to `docs/handoff/design-tokens.json` (white text on rgba(0,0,0,0.6) blur overlay)
- [ ] 10.2 Regenerate token outputs (`pnpm -F @advance-seeds/tokens build`)
- [ ] 10.3 Use the new tokens in viewfinder UI; no inline hex

## 11. Distribution & rollout

- [ ] 11.1 `eas build --profile preview --platform ios` → upload to Firebase App Distribution
- [ ] 11.2 `eas build --profile preview --platform android` → upload to Firebase App Distribution
- [ ] 11.3 Configure Firebase tester groups: `internal`, `pilot`. Invite Jane + Alex into `pilot`
- [ ] 11.4 Update `docs/demo-script.md` — Expo Go QR section becomes "Firebase email invite" section (~10 min iOS, ~3 min Android)
- [ ] 11.5 Update root `README.md` mobile section
- [ ] 11.6 Update `docs/HANDOFF.md` with v0.2.0 capabilities and what unlocks v0.3.0

## 12. QA & polish

- [x] 12.1 Manual smoke on iPad Pro M2 / iPhone Air / Samsung Z Flip 7 FE for current LiDAR, ArUco, capture, result, and ROI-video flows
- [ ] 12.2 Verify every screen still hits its four states (loaded / empty / loading / error)
- [ ] 12.3 Verify measurement error on a known reference (10 mm caliper-measured rice grain → app reads within ±5%)
- [ ] 12.4 Verify storage privacy: signed-out user cannot fetch an `inspection-images/` URL by guessing
- [ ] 12.5 Tag v0.2.0; create GitHub release with build artifacts attached
- [ ] 12.6 Run `openspec archive mobile-real-usage`

## 13. Field-tested polish (post-pilot QA)

- [x] 13.1 `DropdownSearch` — convert from full-screen modal to slide-up sheet capped at ~75% screen height, with a close-icon affordance at the top-left so the parent form stays visible while picking
- [x] 13.2 Recordings list (`/more/recordings`) — virtualize with `FlatList` (each row mounts a video preview, so a long history previously instantiated every player on mount); rows render as standalone cards instead of a single card with internal separators
- [x] 13.3 Profile (`/profile`) — show a one-line role description below the email so a fresh user knows what their account can do (`common:roleDescriptions.{inspector,admin}`)
- [x] 13.4 Hyperparameters defaults — `scoreThreshold` 0.5 → 0.4, `iouThreshold` 0.75 → 0.65 (dialed in from QA tuning runs against the COCO-class generic model)
- [x] 13.5 Dark mode — `AppTopBar` actions theme their icon tint via `useTheme().resolved` and `cloneElement`, so the hardcoded `#1A1A1A` chevron / info icons no longer go invisible on the dark `bg-bg-tertiary` surface; `(tabs)/_layout.tsx` sets explicit `tabBarStyle.backgroundColor` + `tabBarInactiveTintColor` for dark mode so the bottom bar contrasts with the chrome
- [x] 13.6 Sync replay — pre-check `FileSystem.getInfoAsync()` on `local_media_uri` / `local_video_uri` before constructing the upload `FormData`; if the file is gone (iOS purges `tmp/` between launches) drop the queue entry instead of surfacing the raw `NSCocoaErrorDomain Code=260` stack the user can't action

## 14. Live-mode performance pass (post-Z-Flip-7-FE QA)

- [x] 14.1 Live overlay — replace `react-native-svg` `<Svg>/<Rect>` with plain `<View>` borders to avoid the Fabric `addViewAt: failed` mount race that bounced Android into the dev launcher error screen
- [x] 14.2 Live overlay — wrap each box in `Animated.View` with `LinearTransition` + `FadeIn`/`FadeOut` (Reanimated 3) and key by `(class_id, spatial-bucket)` so the same physical detection visibly interpolates across inference frames; produces ~60 fps perceived box motion from 15–30 fps inference
- [x] 14.3 Android live worklet — when an ROI is set, pass `crop = ROI bbox padded to a square` to `vision-camera-resize-plugin` instead of always center-cropping the full frame; the inverse-letterbox math uses the same crop rect so detections still land in original-frame coordinates
- [x] 14.4 ArUco calibration phase 2 — rolling-window median (5 samples) over `pxPerMm`, separate `LOCK_CONFIDENCE = 0.6` / `HOLD_CONFIDENCE = 0.45` thresholds for hysteresis, 1.5 s grace window so the calibration pill doesn't flicker on partial occlusion
- [x] 14.5 TFLite Android delegate — prefer NNAPI (NPU) over Adreno GPU so inference doesn't compete for GPU bandwidth with the camera preview pipeline; CPU fallback if NNAPI unavailable
- [x] 14.6 Worklet → JS backpressure — `Worklets.createSharedValue<boolean>(false)` flag set true before `inferOnJS` and reset on completion / error; the worklet skips frames while the JS thread still has a `model.runSync` in flight, so the JS queue can't grow unbounded
- [x] 14.7 Pre-allocated tensor — reuse a single `Float32Array` across frames instead of `new Float32Array(640*640*3)` per frame; eliminates the scudo "Can't populate more pages" pressure that was starving the camera HAL of buffers
- [x] 14.8 Camera2 stream-count — gate `video`/`audio` props on `recording.isRecording` so live-only mode uses photo + frameProcessor (2 surfaces) instead of photo + video + audio + frameProcessor (4); Exynos 2400 / Z Flip 7 FE caps at 3 streams and was throwing `ERROR_CAMERA_DEVICE` otherwise
- [x] 14.9 `setDetections` mounted-guard — `mountedRef` tracks screen lifecycle so a worklet-queued JS callback that lands after navigation doesn't trip "state update on unmounted component"
- [x] 14.10 Hyperparams playground — collapse `targetFpsIos`/`targetFpsAndroid` into a single `targetFps` (default 30); both platforms now share the same backpressure model, so split tuning is no longer meaningful

## 15. Live-mode polish pass

- [x] 15.1 Inference-time histogram — module-level ring buffer (last 100 samples per delegate) recorded from CoreML / TFLite-NNAPI / TFLite-android-gpu / TFLite-CPU paths; hyperparams playground renders rolling p50 / p95 / p99 + bucketed histogram per source via a `useSyncExternalStore` hook with 200 ms coalesced updates
- [x] 15.2 Reanimated overlay — swap `LinearTransition.duration(120)` for `LinearTransition.springify().damping(18).stiffness(160).mass(0.4)` so detection boxes track motion with a slight settle instead of mechanical linear ease; the spring config is tuned to track real motion without jiggling on every detection update
- [x] 15.3 Multi-marker ArUco — native (Android Kotlin + iOS Obj-C++) computes `pxPerMm` for every detected marker, returns a median across all of them as `multiMedianPxPerMm` plus a `markerCount`, and boosts confidence by 0.05 per extra marker (capped at 1.0); JS reads the new fields and prefers the median when `markerCount > 1`. Wire format is the original 6-tuple extended to 8 elements so older JS bundles ignore the trailing fields gracefully
- [ ] 15.4 Manual device verification on Z Flip 7 FE — confirm histogram populates, spring overlay reads as smooth, and 2-marker calibration tightens the px/mm reading vs a single marker

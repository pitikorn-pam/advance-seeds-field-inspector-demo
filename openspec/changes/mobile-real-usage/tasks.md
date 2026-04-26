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

- [ ] 3.1 Edit `packages/types/src/analyzer.ts` — add `analyzeFrame(frame, options)` and supporting `Frame`, `AnalysisFrameResult` types
- [ ] 3.2 `MockSeedAnalyzer` adds an `analyzeFrame` impl emitting deterministic detections every ~200 ms
- [ ] 3.3 Bump `@advance-seeds/types` to 0.2.0; update consumers in dashboard + mobile (no behavioral change in dashboard since it doesn't use frames)
- [ ] 3.4 Add a unit test for `analyzeFrame` shape conformance (frame ref → result with bbox array)

## 4. TFLite analyzer

- [ ] 4.1 Export YOLOv11n to TFLite via Ultralytics CLI: `yolo export model=yolo11n.pt format=tflite imgsz=640`
- [ ] 4.2 Place the resulting `yolo11n.tflite` at `apps/mobile/assets/models/yolo11n-seeds.tflite`
- [ ] 4.3 Install `react-native-fast-tflite` and `vision-camera-resize-plugin`
- [ ] 4.4 Build `lib/analyzer/TfliteSeedAnalyzer.ts` with `analyzeFrame` running the model on a downscaled 640×640 frame
- [ ] 4.5 Decode YOLO output: anchor boxes → bounding boxes in image space; apply NMS; map to `AnalyzedSeed[]`
- [ ] 4.6 `lib/analyzer/selectAnalyzer.ts` runtime picker: prefer Tflite, fall back to Mock if model fails to load
- [ ] 4.7 Wire the picker through `AnalyzerProvider`; remove the dev-mode warning when a real analyzer is loaded
- [ ] 4.8 Performance target: ≥ 5 fps on iPhone 12 baseline; document achieved fps in `design.md`

## 5. Live calibration

- [ ] 5.1 Add `LiveCalibrator` interface to `@advance-seeds/types`
- [ ] 5.2 `lib/calibration/ManualCalibrator.ts` — returns the user's selected calibration profile's `pxPerMm` constant
- [ ] 5.3 `lib/calibration/ArucoCalibrator.ts` — frame processor plugin running an OpenCV ArUco detector; native bridge
- [ ] 5.4 ArUco native module (iOS): wrap OpenCV's iOS framework via a small Swift Expo Module
- [ ] 5.5 ArUco native module (Android): wrap OpenCV Android (`opencv-mobile` build) via a Kotlin Expo Module
- [ ] 5.6 `lib/calibration/LidarCalibrator.ts` — iOS-only, uses ARKit `ARSession` + depth map for distance
- [ ] 5.7 LiDAR native module (iOS): Swift wrapper exposing `currentDistanceMeters` and `pxPerMm` derived from sensor parameters
- [ ] 5.8 `lib/calibration/selectCalibrator.ts` runtime picker: feature-detect LiDAR support, prefer LiDAR for precise mode, ArUco for live, fall back to Manual
- [ ] 5.9 Calibration confidence threshold: < 0.6 reverts to manual + UI banner "Calibration unavailable — measurements may be approximate"
- [ ] 5.10 Author the printable ArUco reference card PDF at `docs/calibration/aruco-5cm.pdf`

## 6. Camera UI build-out (prototype fidelity)

- [ ] 6.1 `components/camera/DetectionOverlay.tsx` — Skia overlay drawing detection rings + bounding boxes from `analyzeFrame` output
- [ ] 6.2 `components/camera/KpiStrip.tsx` — live "Count / Avg mm / Grade A%" pill bar
- [ ] 6.3 Calibration pill ("ArUco locked" / "Calibration unavailable") in glass style; LiDAR pill is feature-detected (won't show on iPhone Air or Z Flip 7 FE)
- [ ] 6.4 Shutter haptic + capture animation
- [ ] 6.5 Precise mode: corner brackets, crosshair, distance indicator, success ring on lock
- [ ] 6.6 Test on iPhone Air (Dynamic Island safe area) and Z Flip 7 FE (folded + unfolded layouts)

## 6b. Flexible ROI tools

- [ ] 6b.1 `components/camera/RoiToolbar.tsx` — picker for rectangle / polygon / circle / clear
- [ ] 6b.2 Rectangle ROI: drag two corners; 4 draggable handles
- [ ] 6b.3 Polygon ROI: tap to add vertex, double-tap to close; vertex handles draggable after close
- [ ] 6b.4 Circle ROI: tap center, drag radius; center + edge handles
- [ ] 6b.5 Skia overlay renders the active ROI with semi-transparent fill + brand stroke
- [ ] 6b.6 Point-in-shape predicate: `pointInRect`, `pointInPolygon` (ray-cast), `pointInCircle`
- [ ] 6b.7 Wire to KPI strip: counter only sums detections whose centroid is inside the ROI
- [ ] 6b.8 Persist ROI shape (type + image-space coordinates) on the captured inspection's metadata
- [ ] 6b.9 ROI auto-clears when a new live session begins

## 7. Processing & review screens

- [ ] 7.1 `app/capture/processing.tsx` — analysis-on-captured-image UI (image with progress overlay + spinner)
- [ ] 7.2 `app/capture/review.tsx` — captured image at top, bounding boxes + grade colors overlaid via SVG, summary stat tiles below, action buttons "Save" / "Discard"
- [ ] 7.3 Save flow: persist inspection + seeds rows; nav to inspection detail
- [ ] 7.4 Discard flow: delete uploaded image from storage, return to setup
- [ ] 7.5 Both screens follow the four-state pattern (loaded / loading / error)

## 7b. Video recording + in-session snapshots

- [ ] 7b.1 Migration: `recordings` table (id, inspector_id FK, video_url, duration_ms, captured_at, notes); `recordings` storage bucket with same RLS pattern as inspection-images
- [ ] 7b.2 `lib/queries.ts` add `useRecordings`, `useDeleteRecording` (mobile only)
- [ ] 7b.3 `components/camera/RecordButton.tsx` — long-press shutter alternative + dedicated icon button
- [ ] 7b.4 `useRecordingState` hook tracks { isRecording, durationMs, sizeMB }; updates 10×/sec
- [ ] 7b.5 Vision Camera `startRecording` / `stopRecording`; codec h264, hi-res preset, 30 fps
- [ ] 7b.6 Recording timer overlay (top of viewfinder, red dot + MM:SS)
- [ ] 7b.7 Upload to `recordings` bucket on stop; show progress toast
- [ ] 7b.8 Size guard: > 100 MB local file → alert, save-to-Photos / discard, no cloud upload
- [ ] 7b.9 App-backgrounded > 2 s during recording → auto-stop + save
- [ ] 7b.10 `components/camera/SnapshotButton.tsx` — separate icon button (camera + sparkle)
- [ ] 7b.11 Snapshot saves frame to device Photos library via `MediaLibrary.saveToLibraryAsync`
- [ ] 7b.12 First-time snapshot triggers Photos permission prompt; denied → inline error with deep link
- [ ] 7b.13 Snapshot does NOT create an inspection row; toast "Snapshot saved" on success
- [ ] 7b.14 Recordings tab on `/profile` showing the user's videos list with thumbnail + duration

## 8. Per-seed detail, variety detail, profile screens

- [ ] 8.1 `app/inspections/seed/[index].tsx` — full screen with cropped seed thumbnail (from bbox), measurements, defects, prev/next nav
- [ ] 8.2 `app/varieties/[id].tsx` — hero image, scientific name, description, recent inspections list (RLS-scoped)
- [ ] 8.3 `app/profile.tsx` — standalone read-only profile mirroring the prototype
- [ ] 8.4 Wire navigation: inspections detail → tap seed → seed/[index]; varieties → tap card → varieties/[id]; settings → profile row → profile

## 9. Onboarding

- [ ] 9.1 `app/splash.tsx` — 1.5 s logo screen; routes to welcome (first launch) or login
- [ ] 9.2 `app/welcome.tsx` — three-card carousel: Camera / Target / Sync; "Continue" routes to login
- [ ] 9.3 Persist `as.mobile.onboarded` in AsyncStorage; skip welcome on subsequent launches
- [ ] 9.4 First-launch permission request: camera before reaching login

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

- [ ] 12.1 Manual smoke on iPhone 14 Pro (LiDAR path) + Android (ArUco-only path)
- [ ] 12.2 Verify every screen still hits its four states (loaded / empty / loading / error)
- [ ] 12.3 Verify measurement error on a known reference (10 mm caliper-measured rice grain → app reads within ±5%)
- [ ] 12.4 Verify storage privacy: signed-out user cannot fetch an `inspection-images/` URL by guessing
- [ ] 12.5 Tag v0.2.0; create GitHub release with build artifacts attached
- [ ] 12.6 Run `openspec archive mobile-real-usage`

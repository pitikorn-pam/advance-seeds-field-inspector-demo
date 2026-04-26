# Tasks — Mobile Real Usage

## 1. Distribution & dev-client foundation

- [ ] 1.1 Enroll in Apple Developer Program (manual, ~5 business days)
- [ ] 1.2 Add `eas-cli` as a dev dependency on `apps/mobile`; `eas init`
- [ ] 1.3 Author `apps/mobile/eas.json` with `development`, `preview`, `production` profiles
- [ ] 1.4 Run `eas build --profile development --platform ios` once → install dev client on test phone
- [ ] 1.5 Same for Android; signed APK installable on a Pixel test device
- [ ] 1.6 Update `apps/mobile/app.json` plugin list to include the dev-client plugin and reserve room for `react-native-vision-camera` permissions strings (`NSCameraUsageDescription`, `android.permission.CAMERA`)
- [ ] 1.7 Document the dev-client install flow in `apps/mobile/README.md`

## 2. Camera migration (Vision Camera, mock analyzer still)

- [ ] 2.1 Remove `expo-camera` (currently unused) and any references; install `react-native-vision-camera`
- [ ] 2.2 Add the camera config plugin to `app.json` with iOS + Android permission strings
- [ ] 2.3 Build `components/camera/Viewfinder.tsx` — fullscreen camera preview with safe-area handling
- [ ] 2.4 Build `components/camera/ShutterBar.tsx` — shutter / flip / flash / grid actions
- [ ] 2.5 Add the glass-style top bar (back button, mode pill, action button) per prototype
- [ ] 2.6 Capture flow `app/capture/setup.tsx` — variety, batch, mode picker (live / precise)
- [ ] 2.7 `app/capture/scan.tsx` — viewfinder rendering live preview (no detection yet)
- [ ] 2.8 `app/capture/precise.tsx` — viewfinder with crosshair brackets and "Hold steady" guidance
- [ ] 2.9 Shutter capture: high-res photo to a local temp file via `useCameraDevice` + `takePhoto`
- [ ] 2.10 Upload captured photo to Supabase Storage (`inspection-images/<uuid>.jpg`) before navigating to processing
- [ ] 2.11 Permissions flow: pre-flight check on first capture; deep link to Settings if denied

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
- [ ] 6.3 Calibration pill ("LiDAR locked / 24.7 px/mm at 28 cm" / "ArUco locked" / "Calibration unavailable") in glass style
- [ ] 6.4 Tray ROI rectangle overlay for live mode (count seeds inside ROI only)
- [ ] 6.5 Shutter haptic + capture animation
- [ ] 6.6 Precise mode: corner brackets, crosshair, distance indicator, success ring on lock
- [ ] 6.7 Test on iPhone (Dynamic Island safe area) and Android (cutout phones)

## 7. Processing & review screens

- [ ] 7.1 `app/capture/processing.tsx` — analysis-on-captured-image UI (image with progress overlay + spinner)
- [ ] 7.2 `app/capture/review.tsx` — captured image at top, bounding boxes + grade colors overlaid via SVG, summary stat tiles below, action buttons "Save" / "Discard"
- [ ] 7.3 Save flow: persist inspection + seeds rows; nav to inspection detail
- [ ] 7.4 Discard flow: delete uploaded image from storage, return to setup
- [ ] 7.5 Both screens follow the four-state pattern (loaded / loading / error)

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

- [ ] 11.1 `eas build --profile preview --platform ios` → TestFlight upload
- [ ] 11.2 `eas build --profile preview --platform android` → signed APK
- [ ] 11.3 Internal testers: invite Jane + Alex (and any pilot users) to TestFlight
- [ ] 11.4 Update `docs/demo-script.md` — Expo Go QR section becomes "TestFlight invite" section
- [ ] 11.5 Update root `README.md` mobile section
- [ ] 11.6 Update `docs/HANDOFF.md` with v0.2.0 capabilities and what unlocks v0.3.0

## 12. QA & polish

- [ ] 12.1 Manual smoke on iPhone 14 Pro (LiDAR path) + Android (ArUco-only path)
- [ ] 12.2 Verify every screen still hits its four states (loaded / empty / loading / error)
- [ ] 12.3 Verify measurement error on a known reference (10 mm caliper-measured rice grain → app reads within ±5%)
- [ ] 12.4 Verify storage privacy: signed-out user cannot fetch an `inspection-images/` URL by guessing
- [ ] 12.5 Tag v0.2.0; create GitHub release with build artifacts attached
- [ ] 12.6 Run `openspec archive mobile-real-usage`

# Proposal — Mobile Real Usage (Production-shaped)

## Why

The v0.1.0 demo proves the architecture, but the mobile app is functionally a CRUD wrapper over a fixed sample image. It can't do the actual work of seed inspection: open the phone's camera, run YOLOv11n on a live frame, derive real millimeter measurements via on-device calibration, and produce a ground-truth row that downstream R&D analytics can trust. The product roadmap calls this the "production-shaped" milestone — the build the field inspector would actually use, distributed via TestFlight / signed APK rather than Expo Go. Closing the gap unlocks real pilot deployments, validates the ML pipeline against real seeds, and turns the existing data layer from a demonstration into ground truth.

## What Changes

- Replace `MockSeedAnalyzer` with **real YOLOv11n inference** on device via `react-native-fast-tflite`. Add an optional `CoreMLSeedAnalyzer` Expo Module on iOS for Neural Engine acceleration when available.
- Replace the fixed `SAMPLE_IMAGE_URL` capture with **`react-native-vision-camera` live preview** + frame processors for real-time detection.
- Add **live calibration** — ArUco marker detection from camera frames (cross-platform) plus iOS LiDAR depth lock for "hold steady at N cm" UX. Calibration value derived per-frame, applied to YOLO bounding boxes to produce real millimeters.
- **BREAKING**: `SeedAnalyzer.analyze()` migrates from a single `ImageRef` argument to a streaming frame-based interface (`analyzeFrame(...)` for live mode + `analyze(...)` for single-shot). Mock and real implementations both update.
- Build out the prototype's **camera viewfinder UI** — glass top bar, live KPI strip ("47 count / 11.4 mm avg / 83% Grade A"), seed-detection ring overlays drawn in real time, action bar with shutter / flip / flash / grid.
- Add the **review screen** with bounding-box overlay on the captured frame and per-seed drill-down.
- Add the prototype's missing screens: **splash**, **welcome onboarding**, **per-seed full-screen detail**, **variety detail**, **profile**.
- **Distribution**: leave Expo Go behind — configure **EAS Build** for iOS (TestFlight) and Android (signed APK). Update demo + handoff docs.
- **Permissions**: camera, photo library (for picking from gallery as a backup), location (optional, for geo-tagging inspections).

## Capabilities

### New Capabilities
- `mobile-onboarding`: splash + welcome flow shown on first launch; permission requests batched here.
- `live-camera-capture`: `react-native-vision-camera` integration, viewfinder UI, frame processors, **flexible ROI tools (rectangle / polygon / circle)** for honest counting, capture pipeline including upload to Supabase Storage.
- `live-calibration`: ArUco marker detection from frames (cross-platform). LiDAR distance lock ships as feature-detected dormant code; not validated on current test hardware (iPhone Air + Z Flip 7 FE both lack LiDAR).
- `live-recording-and-snapshots`: long-press / dedicated button records video to MP4 in Supabase Storage; an in-session snapshot button saves a frame to the device Photos library without ending live mode. Both are orthogonal to the inspection flow.
- `mobile-distribution`: EAS Build pipeline + **Firebase App Distribution** for both platforms (free, no Play Console; Apple Developer Program $99/yr remains required for iOS signing).

### Modified Capabilities
- `inspections-management`: capture stage now operates on real camera frames, persists the actual frame to storage, applies real measurements. The mocked-analysis scenario is removed; live + precise modes added.
- `reference-data-management`: varieties get a full detail screen with photos, scientific name, description, and recent inspections.
- `theming`: capture screens use a glass-on-camera variant of the design tokens (white text + 60% opacity surfaces) — formalize as theme tokens.

## Impact

- **Code (mobile)**: new `apps/mobile/lib/analyzer/{TfliteSeedAnalyzer,CoreMLSeedAnalyzer,LiveCalibrator}.ts`, new screens for splash/welcome/scan/precise/processing/review/seed/variety/profile, viewfinder components, ArUco detector module, frame processor plugin.
- **Code (shared)**: `packages/types/src/analyzer.ts` interface evolves to support streaming frames and per-frame calibration; bumps minor version for breaking changes; downstream `MockSeedAnalyzer` updates.
- **Dependencies (new)**: `react-native-vision-camera`, `react-native-fast-tflite`, `vision-camera-resize-plugin`, possibly a custom Expo Module for ArUco/LiDAR; `eas-cli` for builds.
- **Assets**: bundled `yolo11n-seeds.tflite` (~6 MB) + `yolo11n-seeds.mlpackage` for iOS; an ArUco marker reference card PDF for the field kit.
- **External services**: Apple Developer Program enrollment (~$99/year) for TestFlight; Google Play optional for internal track; EAS account with build minutes (free tier covers internal use).
- **Demo distribution**: shifts from Expo Go QR (10 sec) to **Firebase App Distribution** email invite (~10 min for first install on iOS, ~3 min on Android). README and demo script update accordingly.
- **Out of scope (non-goals)**:
  - Offline-first sync queue (separate `mobile-offline-sync` change later)
  - Push notifications and background sync
  - Full Play Store / App Store public release (this targets internal/TestFlight distribution only)
  - Native iOS / Android rewrite — Expo + RN remains the mobile surface
  - Training a YOLOv11n model on Advance Seeds' own labeled data (we ship a pre-trained generic-seed model; fine-tuning is a follow-up)
  - Web dashboard changes (this milestone is mobile-only; dashboard already has the data shape it needs)

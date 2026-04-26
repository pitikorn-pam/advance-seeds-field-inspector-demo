# Design — Mobile Real Usage

## Context

v0.1.0 ships a working data layer (Supabase + RLS + CRUD + i18n + theming) with a mocked ML seam. The mobile app's capture flow runs against a fixed sample image and a `MockSeedAnalyzer` that emits deterministic pre-baked results. The visual fidelity to `docs/handoff/prototype.html` is roughly 60% — the prototype's marquee screens (live camera viewfinder with detection overlays, precision mode with LiDAR, processing screen, review screen with bounding boxes) are missing.

Production usage requires three orthogonal pieces working together:

1. A real camera feed (live preview + frame capture).
2. A real ML inference path (YOLOv11n exported to TFLite/CoreML, run on each frame).
3. A real measurement pipeline (per-frame `pxPerMm` from ArUco marker detection or iOS LiDAR depth, applied to YOLO output to get millimeters).

These pieces are tied together by the `SeedAnalyzer` interface, which currently assumes single-shot analysis on a static image. The interface needs to evolve to accept a stream of frames with per-frame calibration metadata.

The distribution channel changes too: every native module we add (`react-native-vision-camera`, `react-native-fast-tflite`, the custom ArUco/LiDAR module) leaves Expo Go incompatible. We migrate to EAS Build with internal distribution.

## Goals / Non-Goals

**Goals:**
- Real on-device YOLOv11n inference at ≥ 5 fps on iPhone 12 / Pixel 6 baseline (live mode); ≥ 1 sec single-shot precision capture.
- Honest measurement: every reported `length_mm` is computed from a real `pxPerMm` derived from ArUco or LiDAR, not a constant.
- Visual parity with the prototype for the capture flow (live viewfinder + precise mode + processing + review + seed detail).
- Clean failure modes: no calibration → guard the user; low-confidence detections → mark them; analyzer unloads → fall back gracefully.
- One JS-facing API across mock + TFLite + Core ML so screens never branch on which analyzer is loaded.
- Distribution that a field inspector can actually install (TestFlight invite, signed APK).

**Non-Goals:**
- Training a custom YOLOv11n model on labeled Advance Seeds data — we ship a pre-trained generic seed detector and accept lower precision until fine-tuning lands.
- Offline-first sync queue with retry, conflict resolution, background uploads — separate change.
- Push notifications, deep links, App Clips, Android instant apps.
- Web dashboard changes — already has the data shape it needs from v0.1.0.
- Cross-platform LiDAR (only iPhone 12 Pro+ has it) — Android falls back to ArUco-only.

## Decisions

### D1. Vision Camera + Frame Processors over expo-camera
`react-native-vision-camera` is the de-facto choice for production camera apps in React Native. It exposes frame processors that run on a separate thread and let us call native ML modules without blocking the UI. `expo-camera` is fine for casual capture but lacks the frame-processor primitive we need for live detection rings. **Trade-off:** vision-camera requires a custom dev client; expo-camera works in Expo Go. Since we're leaving Expo Go anyway for ML, this isn't a real cost.

### D2. TFLite as the cross-platform ML default; Core ML as an iOS upgrade
- `react-native-fast-tflite` (cross-platform) is the default. Ultralytics exports YOLOv11n to TFLite directly via `yolo export model=yolo11n.pt format=tflite`.
- A custom Expo Module wrapping Core ML is added as an opt-in iOS path when the device is iPhone 12 Pro+ (Apple Neural Engine available). Selection happens at app start: feature-detect, prefer Core ML, fall back to TFLite.
- Both implement the same `SeedAnalyzer` interface — screens never know which is loaded.
- Bundle the `.tflite` model in the app (~6 MB); load it once at startup and cache the `TensorflowModel` handle.

### D3. Calibration as a separate concern from analysis
Per design intent: `SeedAnalyzer` consumes `pxPerMm`, doesn't compute it. A new `LiveCalibrator` interface is introduced:

```ts
interface LiveCalibrator {
  readonly id: string;
  observe(frame: Frame): CalibrationReading | null;
}
interface CalibrationReading {
  pxPerMm: number;
  source: "lidar" | "aruco" | "manual";
  confidence: number;            // 0..1
  observedAtMs: number;
}
```

Three implementations:
- `LidarCalibrator` (iOS only) — uses ARKit's `currentFrame.lightEstimate` and depth API to get distance + sensor parameters → compute px/mm.
- `ArucoCalibrator` — runs an ArUco detector on each frame, finds a 5 cm reference marker, computes px/mm from marker pixel size.
- `ManualCalibrator` — fallback, returns a static value from the user's selected calibration profile.

The viewfinder screen subscribes to the calibrator's stream and overlays "LiDAR locked / 24.7 px/mm at 28 cm" once a reading is stable.

### D4. SeedAnalyzer interface evolves (BREAKING)
Current:
```ts
interface SeedAnalyzer {
  analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult>;
}
```
New:
```ts
interface SeedAnalyzer {
  readonly id: string;
  /** Single-shot analysis on a captured photo. Used by precise mode. */
  analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult>;
  /** Real-time per-frame inference. Returns null for frames that should be skipped. */
  analyzeFrame?(frame: Frame, options: AnalyzeOptions): AnalysisFrameResult | null;
}
```
- `analyze` keeps its single-shot contract (used by precise mode and by ML-on-server fallback).
- `analyzeFrame` is the live-detection path. Synchronous (must be cheap; expensive work runs inside the frame processor's worklet thread). Returns null when calibration isn't ready or confidence is too low.
- `MockSeedAnalyzer` adds a stub `analyzeFrame` that emits the same pre-baked results on a 200ms cadence.
- This is a **BREAKING** change to `packages/types/src/analyzer.ts` — `inspections-management` spec gets MODIFIED scenarios.

### D5. Live mode vs Precise mode behavior
| | Live mode (general intake, fast) | Precise mode (lab-grade, slow) |
| --- | --- | --- |
| Calibration | ArUco from frame OR static profile | LiDAR distance lock required (iOS) or ArUco lock (Android) |
| Inference | `analyzeFrame` per camera frame | Single `analyze` call on captured high-res photo |
| Viewfinder UI | Detection rings drawn over live preview, KPI strip updates continuously | Crosshair + distance number; brackets + "Hold steady"; success ring on lock |
| Stored row | Inspection from the moment the user taps shutter (last frame) | Inspection from the captured high-res frame |
| Frame rate target | ≥ 5 fps | N/A (single shot) |

### D6. Bounding-box overlay rendering
Live mode draws boxes via `react-native-skia` over the camera surface — Skia keeps the worklet → UI bridge tight (~16ms). Static review screen renders boxes via `react-native-svg` over an `<Image>` since the source is static. Both consume the same `bbox: { x, y, width, height }` shape from the analyzer.

### D7. Distribution: EAS Build internal + Apple Developer Team
- Apple Developer Program account ($99/year) is the gate. Once enrolled, `eas build --profile preview --platform ios` produces a TestFlight-ready build.
- Android uses `eas build --profile preview --platform android` → APK download URL or Google Play internal track (optional, requires Play Console account).
- EAS profiles in `eas.json`:
  - `development` — dev client for local Metro
  - `preview` — internal distribution (TestFlight + APK)
  - `production` — App Store / Play Store (deferred)
- Code signing uses EAS-managed credentials (auto-generated certs / keystores stored in EAS secret store).
- README and demo script update from "scan QR with Expo Go" to "accept TestFlight invite".

### D8. Onboarding pattern (matches prototype)
- `splash` — brief logo screen, 1.5s, then route to `welcome` (first launch only) or login.
- `welcome` — three-card carousel: Camera (live detection), Target (precision mode), Sync (cloud R&D).
- After onboarding: prompt for camera permission, then route to login.
- `AsyncStorage` flag `as.mobile.onboarded` persists across launches.

### D9. Variety detail + profile screens
Both new in this change. Variety detail is a hero image + scientific name + description + recent inspections list (filtered to that variety, scoped by RLS). Profile is the prototype's standalone version of the read-only profile that's currently inside Settings. Both are static reads; no new mutations.

## Repo / file layout

```
apps/mobile/
├── app/
│   ├── splash.tsx                  ← NEW
│   ├── welcome.tsx                 ← NEW
│   ├── (tabs)/
│   │   ├── capture.tsx             ← REWRITE: routes to scan/precise based on mode
│   │   └── ...
│   ├── capture/                    ← NEW group
│   │   ├── _layout.tsx             ← stack with no header
│   │   ├── setup.tsx               ← variety / batch / mode picker
│   │   ├── scan.tsx                ← live camera viewfinder
│   │   ├── precise.tsx             ← precision mode w/ LiDAR
│   │   ├── processing.tsx          ← post-shutter analysis screen
│   │   └── review.tsx              ← bounding-box overlay + stats
│   ├── inspections/
│   │   ├── [id].tsx                ← existing
│   │   └── seed/[index].tsx        ← NEW per-seed full screen
│   ├── varieties/
│   │   ├── index.tsx               ← keep
│   │   └── [id].tsx                ← NEW variety detail
│   └── profile.tsx                 ← NEW
├── components/
│   ├── camera/
│   │   ├── Viewfinder.tsx          ← NEW
│   │   ├── DetectionOverlay.tsx    ← Skia overlay
│   │   ├── KpiStrip.tsx            ← live "Count / Avg mm / Grade A"
│   │   └── ShutterBar.tsx
│   └── ui/...
├── lib/
│   ├── analyzer/
│   │   ├── MockSeedAnalyzer.ts     ← keep, extended with analyzeFrame
│   │   ├── TfliteSeedAnalyzer.ts   ← NEW
│   │   ├── CoreMLSeedAnalyzer.ts   ← NEW (iOS only)
│   │   └── selectAnalyzer.ts       ← NEW: picks best impl at runtime
│   ├── calibration/
│   │   ├── LidarCalibrator.ts      ← NEW (iOS)
│   │   ├── ArucoCalibrator.ts      ← NEW
│   │   ├── ManualCalibrator.ts     ← NEW
│   │   └── selectCalibrator.ts     ← NEW
│   └── ...
├── modules/
│   └── advance-seeds-vision/       ← NEW custom Expo Module: Core ML + LiDAR + ArUco
│       ├── ios/
│       └── android/
├── assets/
│   └── models/
│       ├── yolo11n-seeds.tflite    ← bundled model
│       └── yolo11n-seeds.mlpackage ← iOS model
└── eas.json                        ← NEW
```

## Risks / Trade-offs

- **[YOLOv11n on a generic dataset has low precision on real Thai rice / mungbean]** → ship as a known limitation in v0.2.0; queue a fine-tuning sprint for v0.3 once Advance Seeds provides labeled data.
- **[Frame processors lock to ~16ms; YOLOv11n inference is 30–80ms]** → live detection runs at ≤ 10 fps, not 30 fps. Acceptable for the use case; documented in the spec.
- **[ArUco detector under poor lighting fails silently]** → confidence < 0.6 reverts to manual calibration; UI surfaces this honestly via the calibration pill.
- **[Apple Developer enrollment can take days]** → start the enrollment now; design the build pipeline so EAS Build profiles are ready when the team ID arrives.
- **[Custom Expo Module adds Xcode + Android Studio dependencies]** → already required by EAS Build; the dev client install step in README documents this.
- **[Bundled .tflite adds ~6 MB to the app]** → acceptable; alternative (downloading on first launch) makes airline / coffee-shop demos unreliable.
- **[Real measurements expose calibration accuracy issues earlier than model precision issues]** → expected; LiDAR + ArUco both have known error bands. Document the expected ±5% measurement error in the spec.

## Migration Plan

1. Branch off `main`, all work on `mobile-real-usage`.
2. Land EAS config + dev client first so the team can install builds early.
3. Migrate to `react-native-vision-camera` as a no-op replacement (still mock analyzer, still no calibration).
4. Wire `LiveCalibrator` and the manual + ArUco implementations.
5. Wire `TfliteSeedAnalyzer` with the bundled model. Frame processor calls it.
6. Add LiDAR calibrator (iOS only) and Core ML analyzer (iOS only) as opt-in upgrades.
7. Build out the missing screens (splash → welcome → setup → scan/precise → processing → review → seed; variety detail; profile).
8. Update demo script + README + handoff doc.
9. Internal smoke test on at least one iPhone (LiDAR) and one Android.
10. EAS Build preview profile → TestFlight + APK distribution.
11. Tag v0.2.0.

Rollback: if any phase blocks for > 3 days, revert that phase, ship the increment, queue the rest. The `SeedAnalyzer` interface evolution means partial work can still ship — `MockSeedAnalyzer` continues to satisfy the contract while real impls land.

## Open Questions

These need answers before implementation kicks off — they shape the architecture and the calendar:

1. **Apple Developer Program**: do you already have an enrollment in your name or the company's? If not, start it today (5–10 business day approval); without it we can't sign builds for TestFlight. iPhone hardware can sideload via signed dev builds locally but TestFlight invites require a paid team.
2. **Android distribution**: Google Play internal track (requires Play Console account, $25 one-time) or just signed APK download links? APK is faster; Play track is more professional.
3. **Test hardware**: which physical phones do you have access to for testing? The LiDAR path needs an iPhone 12 Pro / Pro Max or newer Pro model. ArUco path works on any phone with a camera.
4. **YOLOv11n training data**: does Advance Seeds have a labeled dataset of seed images (any quantity)? If yes, we ship a fine-tuned model in v0.2.0 and the precision is much higher. If no, we ship a generic pre-trained model and queue fine-tuning as v0.3.
5. **ArUco marker form factor**: 5 cm × 5 cm is the prototype's reference. Is that the production reference, or do you have an existing branded calibration card? We can ship a printable PDF in `docs/calibration/`.
6. **Live mode KPI bar**: the prototype shows "Count / Avg mm / Grade A %" updating live. Do you want it to count only seeds inside a target ROI rectangle, or all seeds in the frame? ROI counting is more honest (avoids accidentally counting the inspector's hand).
7. **First-frame storage**: when the user taps shutter in live mode, do we store the last frame (cheap, low-quality) or capture a fresh high-res photo (~300 ms delay before result)? The prototype implies the former; precise mode definitely uses the latter.

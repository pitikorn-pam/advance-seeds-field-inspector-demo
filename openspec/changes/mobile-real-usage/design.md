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

Implementation note: `@advance-seeds/aruco-calibrator` wraps OpenCV on iOS and Android through a local Expo Module and detects a DICT_4X4_50 marker in saved images during `capture/processing`. The same module registers a Vision Camera frame processor named `detectArucoCalibration` on both platforms; live and precise capture screens require an ArUco confidence lock before photo or video capture, and saved inspection metadata records the locked px/mm reading.

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

### D7. Distribution: EAS Build + Firebase App Distribution
- Apple Developer Program account ($99/year) remains the gate for any iOS install on a non-developer device — Firebase doesn't escape this. Build signing requires a valid developer cert.
- **Firebase App Distribution** replaces TestFlight as the iOS delivery channel: free, no 90-day build expiry, no Apple build review, polished install flow on both platforms. EAS Build's Firebase integration uploads automatically.
- **Android: APK distribution via Firebase** — no Play Console required (Play Console is for store distribution, not signing). Same install flow as iOS for tester parity.
- EAS profiles in `eas.json`:
  - `development` — dev client for local Metro
  - `preview` — Firebase App Distribution upload (iOS + Android)
  - `production` — App Store / Play Store (deferred to a later milestone)
- Code signing uses EAS-managed credentials. The Apple Developer Team ID is the only blocking external dependency; Firebase project setup is ~10 minutes.
- README and demo script update from "Expo Go QR" to "accept Firebase email invite, install on phone".

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

## Resolved Decisions

All seven open questions are resolved as of 2026-04-26; carrying the answers into the architecture below.

1. **Distribution**: Apple Developer Program enrollment proceeds in parallel with code work. **Firebase App Distribution** is the delivery channel for both platforms (free, no Play Console needed for Android, no TestFlight review for iOS). Apple Developer cert remains the unavoidable iOS signing requirement.
2. **Android**: Firebase App Distribution. No Play Console.
3. **Test hardware**: iPhone Air + Samsung Z Flip 7 FE. **Neither has LiDAR** — iPhone Air is the slim tier of the iPhone 17 line; LiDAR remains iPhone Pro-exclusive. The LiDAR calibrator ships as feature-detected dormant code; ArUco is the validated production calibration path on the team's hardware. LiDAR validation deferred to a later milestone with Pro hardware.
4. **Training data**: none available. Ship the pre-trained generic YOLOv11n. Document the precision floor (~70–80% on Thai rice/mungbean) and queue fine-tuning as a follow-up change once Advance Seeds provides labeled images.
5. **ArUco marker**: ship a generic printable PDF at `docs/calibration/aruco-5cm.pdf` (DICT_4X4_50, marker ID 0). Branded card is a v0.3 nice-to-have.
6. **Live mode KPI / ROI**: ROI is **flexible — rectangle, polygon, or circle**. User picks an ROI tool from the camera toolbar; counter logic uses point-in-shape on each detection's centroid. Default is full-frame (no ROI applied) on first capture; once an ROI is drawn, it persists per-session.
7. **Live mode shutter**: store the last frame (no shutter latency, matches the prototype). Precise mode captures a fresh high-res photo. Plus two new orthogonal features: **video recording** (long-press shutter or dedicated record button → MP4 upload to Supabase Storage) and **snapshot while live** (separate snapshot button → saves current frame to local Photos library + optional auxiliary upload, without ending the live session).

## Open Questions

None at the start of implementation. Reopen if the LiDAR path becomes testable (acquire a Pro device) or if Firebase App Distribution caps surface in real use.

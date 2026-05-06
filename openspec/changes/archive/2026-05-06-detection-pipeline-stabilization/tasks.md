# Tasks — Detection Pipeline Stabilization

All tasks below are **complete** and shipped to both iPhone Air and Z Flip 7 FE. Listed in the order they were tackled in-session.

## Decoder correctness (cross-platform JS)

- [x] Identify "all detections at top-left corner with 1×1 size" symptom = bbox format mismatch (xyxy vs cxywh)
- [x] Implement `pickBoxFormat` heuristic in `yolo.ts` — sample top-K above-threshold rows
- [x] Implement per-row coord-space classifier — model-input pixel / source-image pixel / normalized-to-source / normalized-to-canvas
- [x] Stabilize picker against trailing noise rows (top-5-row sampling, default to xyxy)
- [x] Add `unrotateBbox` helper for orientation-aware sensor-coord mapping

## iOS native fixes (Swift + Obj-C)

- [x] Fix `flattenLargestOutput` to match by detection-shape signature instead of element count (Swift)
- [x] Mirror in `flattenLargestMultiArray` (Obj-C frame processor)
- [x] Pass `frame.orientation` through frame-processor result map
- [x] Fix `CoreMLSeedAnalyzer` letterbox (center-crop → aspect-fit-pad)
- [x] Add missing `decodeYoloSegmentationNms` branch in `CoreMLSeedAnalyzer`
- [x] Rebuild + reinstall to iPhone Air

## Android native fixes (Kotlin)

- [x] Implement `decodeJpegToRgba` in `AdvanceSeedsCoreMLRunnerModule.kt`
- [x] Apply EXIF rotation via `androidx.exifinterface` before returning bitmap
- [x] Add `androidx.exifinterface:exifinterface` dependency to module gradle
- [x] Wire `TfliteSeedAnalyzer` to use the native decode on Android with jpeg-js fallback
- [x] Rebuild + reinstall to Z Flip 7 FE

## Capture flow

- [x] Switch analyzer + ArUco re-detection to use the optimized 1280-long-edge JPEG (`processing.tsx`)
- [x] `setBusy(true)` before `recording.stop()` in `scan.tsx` (video stop crash)
- [x] Replace hard "no seeds detected" error with warning + save (`processing.tsx`)
- [x] Capture-setup binding-guard alert with deep-link to variety editor

## Live overlay state

- [x] Add `enabledRef` to all decode paths in `useLiveDetections`
- [x] Render gate on `cameraActive && !busy` in `scan.tsx` and `precise.tsx`
- [x] Single useEffect to clear state on disable

## Bbox bounds policy

- [x] Replace strict drop with clip-and-keep at ≥25 % visibility
- [x] Add ≥85 % frame-area drop for spurious oversized detections
- [x] Surface drop counters in `mapDetectionsToSeeds` Metro log

## Inspection result UX

- [x] Calibration warning triggers on three conditions (missing / non-ArUco / all-reject)
- [x] Seed-hero crop projection uses `bbox + 15 % margin` (consistent across platforms)
- [x] Diagnostic banner gated to error-only states
- [x] Switch SeedDetailView from `expo-image` to RN `<Image>` (cross-platform consistency)

## Variety editor

- [x] Remove Family Color section
- [x] Remove Detector Class chip section
- [x] Status toggle color reflects active/inactive state (`success-text` vs `warning-text`)

## Model registry

- [x] Relax `class_names` validation to "non-empty array of unique strings"
- [x] Accept both NMS-fused (`output_shape[2] === 38`) and raw (`4 + nc + 32`) layouts

## Authentication

- [x] `autoRefreshToken: false` in supabase client
- [x] `AuthProvider` validates via `getSession` + `refreshSession`
- [x] Start/stop `autoRefresh` on `AppState` transitions
- [x] Console.error filter + unhandledrejection handler for residual SDK noise

## Other UX

- [x] History uses `useInfiniteQuery` with cursor pagination on `captured_at`
- [x] Settings → Model Registry consolidation (auto-install-on-Wi-Fi toggle moved)
- [x] Image-load error surface on `CaptureMediaPreview` and seed-hero
- [x] DetectionOverlay shows variety name as bbox label

## Code cleanup

- [x] Remove `_useLiveDetectionsTflite` legacy fallback (~262 lines)
- [x] Remove obsolete `pickNormalizedToSource` and `pickCoordSpace` helpers
- [x] Gate seed-hero diagnostic banner to error-only states

## Path B Phase 1 (attempted, reverted)

- [x] Swift `flattenLargestOutput` returns all multi-array outputs via `extraOutputs`
- [x] Discovered: marshaling 820k-float prototype as `[Double]` breaks iOS post-capture
- [x] Reverted Swift change; kept TS `extraOutputs?` type as harmless documentation
- [x] Documented binary-blob bridge as the path forward for Phase 2

## Diagnostics

- [x] `[yolo] seg decoder format=… space=… letterbox=… srcWxH=… samples=…` log on format change
- [x] `[yolo] mapDetectionsToSeeds in=N kept=N dropped(oob)=N dropped(roi)=N dropped(big)=N first=…`
- [x] `[live-detections android-native] delegate=cpu/gpu (first inference: Nms)` log on delegate change

# Design — Detection Pipeline Stabilization

## Coordinate-space taxonomy

The fundamental insight that drove most of this change set: **a YOLO segmentation model's output bbox can be in any of four coordinate conventions**, depending on training and export configuration:

1. **Model-input pixel space** — values in `[0, target=640]`. Standard for Ultralytics non-NMS exports.
2. **Source-image pixel space** — values in `[0, srcW]` × `[0, srcH]`. Produced when the model graph bakes inverse-letterbox into the post-NMS layer (Ultralytics `dynamic=True` CoreML export).
3. **Normalized to canvas** — values in `[0, 1.5]`, scaled to the 640×640 padded canvas. Some custom exports.
4. **Normalized to source** — values in `[0, 1.5]`, scaled to the source image dims. Common with Vision-framework-aware exports on iOS.

Per-row classification by magnitude alone is unreliable because real detections at canvas edges can have values across class boundaries. The shipped solution is a **two-stage decision**:

- **Format** (`xyxy` vs `cxywh`): top-5-row vote on which interpretation produces positive-area bboxes.
- **Coord-space** (per row): magnitude check (`> target * 1.1`), normalized check (`≤ 1.5`), with retry on bounds-failure (canvas+letterbox first, fall back to norm-to-source).

The picker biases toward Ultralytics-default `xyxy` and only flips when `xyxy` gets zero hits among the high-score top rows.

## iOS post-capture failure mode (and the lesson)

The iOS Swift `flattenLargestOutput` originally selected the largest MultiArray output by element count. For YOLO seg models with two outputs:

- Detection output: `[1, 300, 38] = 11,400 floats`
- Mask prototype: `[1, 32, 160, 160] = 819,200 floats`

The mask prototype is 70× larger. The selector returned mask prototype activations as if they were detections — every "detection" was a random mask coefficient, with malformed scores (often > 1.0 or > 100) and class IDs in the hundreds.

**Crucially, every coordinate-space and format heuristic we layered on top of this was trying to make sense of garbage data.** Once the Swift selector was changed to match by detection-shape signature (`[1, 300, 6]` or `[1, 300, 38+]`), the JS-side heuristics finally had real data to work with and converged on correct interpretations.

**Lesson**: when an end-to-end pipeline produces consistently wrong output despite passing each stage's local sanity checks, distrust your tensor identification, not your math. The largest tensor is not necessarily the one you want.

## Live overlay race

When the user taps shutter or otherwise navigates away from `/capture/scan`:

- The hook's `enabled` prop flips to `false`.
- The `useEffect([enabled])` fires `setDetections(null)` to clear the visible bbox.
- **However**: a frame processor invocation in flight (already past the `if (!enabled) return` guard) eventually calls `setDetections(...)` from `decodeOnJS` **after** the cleanup. The state lands populated again.
- The user navigates back, re-enables the camera. The cached detection is still there. They see a stale bbox from the previous session "stuck" until ArUco re-detects (which triggers a state reset).

**Fix**: an `enabledRef` mirrors `enabled` synchronously. Inflight `decodeOnJS` callbacks check `enabledRef.current` and skip `setDetections` entirely if disabled. Belt-and-suspenders: render-time gate on `cameraActive && !busy` in `scan.tsx` and `precise.tsx`.

## Video stop crash

Camera teardown on iOS during video stop is sensitive to the live frame processor still being attached. The frame processor shares the camera buffer pool with the running video encoder; AVFoundation's stop sequence races with worklet writes back into a buffer about to be released. Result: native crash, app dies immediately.

**Fix**: `setBusy(true)` before `recording.stop()`. The existing `activeFrameProcessor = busy ? undefined : ...` gate detaches the processor instantly. Camera tears down with a clean slate.

This is the same pattern the photo capture path already used (line 254 of `scan.tsx`); the video-stop branch was just missing the equivalent guard.

## Calibration policy

The single warning condition (all seeds graded reject) was insufficient. There are three orthogonal failure modes:

1. **No calibration metadata** — `pxPerMm` falls back to the global default (`38.4`). Measurements are placeholder values.
2. **Calibration source ≠ ArUco** — LiDAR or live-derived `pxPerMm` reused on the captured photo. Pixel scale doesn't match the photo's resolution; mm values systematically over- or under-shoot.
3. **All seeds graded reject** — even with ArUco source, sub-millimeter measurements suggest the marker detection produced a wrong value (off-spec marker, skewed perspective).

The shipped warning card distinguishes all three with tailored reasons, surfaces `px_per_mm` and `source` for diagnosis, and consistently links to "re-capture with ArUco card visible" as the recovery action.

## Bbox bounds clipping

Three failure modes coexist:

1. **Phantom detections fully outside the image** — model false positives in the canvas padding region. Visible area = 0; should drop.
2. **Banana-at-the-edge** — real banana with bbox extending slightly off-frame. Visible area = 30–80 %; should keep with clipped bbox.
3. **Spurious "the whole image is a banana"** — high-confidence detection covering most of the frame, often a model false positive on the gray padding. Visible area = 90 %+; should drop.

The shipped policy: clip to image bounds; keep if `visibleFraction >= 0.25`; drop if `clippedArea / frameArea > 0.85`. The 25 % floor lets edge bananas through. The 85 % cap catches frame-fillers without rejecting close-up legitimate captures (which typically max out at 60–70 %).

## Path B Phase 2 architecture (deferred)

Tried in Phase 1: Swift `flattenLargestOutput` returns all MultiArray outputs as `[Double]` (NSArray<NSNumber>). 820k-float prototype × ~80 bytes per NSNumber = ~65 MB Objective-C heap allocation per analyze. Beyond the wall-clock cost, the bridge serialization had unexpected side effects on the Vision request lifecycle — post-capture detection silently returned zero results.

Path forward for Phase 2:

**Option A — Binary-blob bridge.** Swift returns prototype as `Data` (raw `Float32` bytes); JS receives as `ArrayBuffer` and re-views as `Float32Array`. Expo Modules SDK supports this for `AsyncFunction` returns. Eliminates NSNumber boxing; ~3.2 MB transfer instead of ~65 MB. JS-side cost moves to mask reconstruction (~30 ms per detection for 32-coef × 160×160 dot product + sigmoid + threshold + contour trace).

**Option B — Native-side mask reconstruction.** Swift computes per-detection mask, traces contour to a polygon (10–30 points), returns just the polygon coords. ~150 lines of Swift (matrix multiply + marching squares). JS just renders.

Option B is cleaner architecturally; Option A is faster to implement. Either way: phased validation in a dedicated session.

## What we learned about the Vision Camera bridge on Android

Attempted: return Kotlin `FloatArray` from `outputValues()` to skip the per-Double boxing in `List<Double>`. Result: live overlay stopped drawing bboxes on Z Flip 7 FE. The bridge serialized `float[]` to either `undefined` or an empty array on the JS side.

Result: shipping the `List<Double>` variant despite the boxing cost. Documented in code that primitive arrays don't round-trip the bridge reliably on this device, and noted that a binary-blob bridge would be the proper fix.

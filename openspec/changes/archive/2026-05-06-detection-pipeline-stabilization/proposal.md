# Proposal — Detection Pipeline Stabilization (v0.4.x → v0.5.x)

## Why

The Phase 2 detection pipeline shipped end-to-end across both platforms (iOS Core ML + Android TFLite) but field testing on real seg-trained models surfaced a cascade of correctness, performance, and UX issues:

- **iOS post-capture** silently decoded mask-prototype activations as if they were detections (the Swift `flattenLargestOutput` picked the largest output by element count rather than by detection-shape signature). Every "detection" came back as random mask noise — wrong scores, garbage class IDs, malformed bboxes.
- **iOS live overlay** drifted at frame edges because the JS-side letterbox-inverse used pre-rotation sensor dims while Vision rotated the buffer to portrait before model inference. Edge detections appeared at wildly wrong positions; users called this "messy/blinking everywhere."
- **iOS post-capture letterbox** assumed center-crop while Vision actually applied aspect-fit-pad. Bboxes near edges drifted into blank/unrelated regions.
- **Android post-capture** decoded JPEGs in pure JavaScript via `jpeg-js` (multi-second on Hermes for full-res photos) and ignored EXIF rotation, so per-seed thumbnails on the inspection result page rendered against a different orientation than the analyzer used to compute bboxes — bboxes landed in wrong segments of the displayed image.
- **Decoder coordinate handling** assumed a single bbox format and a single coordinate space. Real-world Ultralytics exports vary by training/export config: detections can arrive as `[x1, y1, x2, y2]` or `[cx, cy, w, h]`, in 640-canvas pixel space, source-image pixel space, or normalized [0,1] to either canvas or source.
- **Live overlay race**: navigating away from `/capture/scan` while the frame processor was still attached pinned the last detection on screen until ArUco re-detected. Caused by inflight worklet results landing on the JS thread *after* the consumer had disabled the hook.
- **Video stop crash**: stopping a recording while the live frame processor was still attached crashed the camera teardown sequence — the worklet shared a buffer with the running video encoder and AVFoundation/CameraX teardown raced.
- **Multiple smaller correctness gaps**: missing `decodeYoloSegmentationNms` branch in iOS post-capture, model registry rejecting valid 2-class and 6-class NMS-fused models because of an over-strict `class_names` and `output_shape` contract, hooks-order bugs from earlier JS additions, calibration warning that only fired when every seed graded reject (silent on partial-failure cases), banana-at-the-edge detections dropped wholesale instead of clipped, "all seeds graded reject" hard error with no recovery path.

The result by mid-session was a pipeline that worked on the bundled YOLO26 demo model but produced silent failures on freshly-trained custom seg models — exactly the use case the field inspector exists to validate.

## What Changes

### Decoder layer (cross-platform, JS)

- **Per-row coordinate-space detection** in `decodeYoloSegmentationNms`. Each row independently classifies as 640-pixel-canvas, source-image pixel space, or normalized-to-source based on its own value magnitudes. Replaces the brittle global heuristic that flickered between formats on noisy data.
- **Top-K format auto-detect**. `pickBoxFormat` samples the first 5 above-threshold rows (the high-confidence detections at the top of an NMS-fused output) and defaults to `xyxy` unless every sampled row fails xyxy validity. Stable across consecutive frames where trailing noise rows used to flip the decision.
- **Bbox bounds clipping with visibility floor**. Detections whose bbox extends past the frame are clipped to image edges and kept if ≥25 % of the original area remains inside. Rejects fully-out-of-frame phantoms while keeping legitimate banana-at-the-edge captures.
- **Spurious-large filter**. Bboxes whose visible area exceeds 85 % of frame area get dropped — only catches the egregious "the whole image is a banana" false positives that survive class filtering.

### iOS native (Swift + Obj-C)

- **`flattenLargestOutput` + `flattenLargestMultiArray` shape-aware selector**. Both the Swift post-capture path and the Obj-C frame-processor path now match by `[1, 300, 6]` / `[1, 300, 38+]` detection signature instead of element count. The mask prototype tensor (~820k floats, 4D) is no longer mistakenly returned as the primary detection output.
- **Frame orientation pass-through**. The Obj-C frame processor includes the `frame.orientation` in its result map. The JS side uses post-rotation dims for letterbox-inverse and applies `unrotateBbox` to map detections from rotated-canvas coords back to sensor coords. Edge drift on iOS live is gone for `right` and `left` orientations; other orientations untested but supported in code.
- **`CoreMLSeedAnalyzer` aspect-fit-pad letterbox**. Replaced the previous center-crop convention to match Vision's actual `VNImageCropAndScaleOptionScaleFit` behavior.
- **`CoreMLSeedAnalyzer` segmentation branch**. Added the missing `decodeYoloSegmentationNms` route — iOS post-capture now decodes seg-NMS output the same way Android does.

### Android native (Kotlin)

- **EXIF-aware `decodeJpegToRgba`**. Reads `TAG_ORIENTATION` and applies the matching rotation matrix before returning the bitmap. The bitmap dims now match what RN `<Image>` sees on the inspection result page; per-seed thumbnails render against the correct image orientation.
- **Native JPEG decode for post-capture**. Replaces pure-JS `jpeg-js` (~400 ms per photo) with `BitmapFactory` (~30–50 ms). Combined with the analyzer-input downsizing to 1280 long edge in `processing.tsx`, post-capture analyze on Android is roughly 50× faster.

### Live-overlay state machine (JS)

- **`enabledRef` in `useLiveDetections`**. Worklet-dispatched results check `enabledRef.current` before writing to React state. Inflight detections from before the consumer disabled the hook no longer pin a stale bbox on screen.
- **Render-time gate** on `cameraActive && !busy` in both `scan.tsx` and `precise.tsx`. Belt-and-suspenders: even if a stale state slips through the hook, the screen no longer renders it.

### Capture flow (JS)

- **Photo upload uses optimized 1280-long-edge JPEG everywhere**. ArUco re-detection, analyzer inference, and Supabase upload all share the same image, so `pxPerMm` stays in the same pixel space as the bbox coordinates the analyzer produces.
- **`setBusy(true)` before `recording.stop()`**. Detaches the live frame processor before signaling video stop, so the camera tears down cleanly and the app no longer crashes immediately on "stop recording."
- **Empty-result handling switched from hard error to warning**. `processing.tsx` previously threw "No seeds detected — every bounding box was outside the captured image" any time the analyzer returned zero seeds. Now it logs a warning and saves the inspection with an empty result; the inspection-result page surfaces the count clearly so the operator can re-capture if needed.
- **Variety-binding deep-link guard at capture setup**. When the active model exposes `class_names` and the chosen variety has no matching `model_class_aliases`, an alert blocks Continue and offers a deep-link to the variety editor's Model Classes section.

### Model registry contract relaxation

- **`compatibility.validateModelMetadata`**: `class_names` is now any non-empty array of unique strings (was hard-coded to a 6-class produce list). `output_shape[2]` accepts both NMS-fused (`38`) and raw (`4 + numClasses + 32`) layouts. Operators can install single-class detectors, multi-class graders, custom-language class names, etc., without app-side code changes.

### Variety editor UX

- **Removed Family Color and Detector Class chip sections**. The Family Color was purely visual and never affected detection; the Detector Class section keyed off `coco_class_id` which only made sense for the bundled COCO YOLO. Variety→model binding now happens entirely through `model_class_aliases` (name-based), which is the durable cross-model approach.
- **Status toggle color reflects active/inactive state** — `text-success-text` vs `text-warning-text`. Matches the convention already used by the list-row Pill tones.

### Inspection result page

- **Calibration warning** triggers on three conditions instead of one: (a) no calibration metadata at all, (b) source ≠ ArUco (lidar/manual sources don't match the captured photo's pixel space), (c) every seed graded reject. Each case shows a specific, actionable reason.
- **Seed-hero image** uses a fixed `bbox + 15 % margin` crop projection. Same visual framing on iOS and Android regardless of how big the stored `image_url` is.
- **Diagnostic banner** on the seed-hero only renders when something is actually wrong (no image_url, getSize/load error, invalid bbox, or out-of-bounds bbox). When everything is healthy, it stays out of sight.

### Observability and supporting work

- **Diagnostic Metro logs** (`__DEV__` gated) that pinpointed every regression we hit: `[yolo] seg decoder format=… space=… letterbox=… srcWxH=… samples=…`, `[yolo] mapDetectionsToSeeds in=N kept=N dropped(oob)=N dropped(roi)=N dropped(big)=N first=…`, `[live-detections android-native] delegate=cpu/gpu (first inference: Nms)`. Future regressions on new model exports or device combinations will be self-explaining.
- **History feature uses `useInfiniteQuery`** with cursor pagination (page size 30 keyset on `captured_at`). Server-side date-range filter; sync-state filter stays client-side because pending/failed entries live in the local queue.
- **Supabase auth boot noise eliminated**. `autoRefreshToken: false` in the client; `AuthProvider` validates via awaited `getSession` + `refreshSession` and starts/stops the auto-refresh tick on `AppState` transitions. Stale-token boot lands the user on the login screen silently instead of printing the red `[AuthApiError: Invalid Refresh Token: Refresh Token Not Found]` stack.
- **Settings → Model Registry consolidation**. The auto-install-on-Wi-Fi toggle moved out of Settings into the Model Registry screen where it has natural context.

## Capabilities

### Modified capabilities

- **`live-camera-capture`** — coordinate-space correctness, orientation handling, frame-processor lifecycle gating, video stop crash fix, defensive empty-result handling.
- **`inspections-management`** — calibration warning gating, seed-hero image projection, diagnostic banner, history pagination, decoder shape support for any NMS-fused/raw export.
- **`reference-data-management`** — variety editor simplified (Family Color and Detector Class sections removed), variety→model binding goes through `model_class_aliases`, model registry validates relaxed contract.
- **`live-calibration`** — calibration source surfaced on the inspection result with proactive warnings.
- **`authentication`** — boot-time refresh-token noise suppressed; manual refresh on AppState foreground.
- **`mobile-navigation`** — Settings → Model Registry move; capture-setup binding-guard alert with deep-link.

### Not introducing new capabilities

This change set is correctness, performance, and UX work on existing capabilities. No spec-level new behavior is added.

## Path B status (mask rendering)

Phase 1 of "render curved seed outlines from mask prototypes" was attempted (Swift returns all output tensors via `extraOutputs`). The 820k-float prototype tensor marshaled as `[Double]` (NSArray<NSNumber>) broke iOS post-capture detection — Vision request lifecycle had unexpected side effects. Reverted in the same session.

A future Path B Phase 2 remains viable but needs a binary-blob bridge (`Data` → `ArrayBuffer`) or native-side mask reconstruction (with only polygon points crossing the bridge). Either approach is a focused 2-3 hour session with phased validation, not a one-shot ship. **Recorded as deferred** in the docs but not part of this change.

## Risk and rollback

- **Native code changed in iOS Swift + Obj-C and Android Kotlin** — three rebuild cycles to verify each platform. Each native change preceded by JS-side validation where possible.
- **Decoder math changed in shared `yolo.ts`** — affects all four inference paths simultaneously. Mitigated by the per-row design (each row picks its own interpretation, so a misclassification on one row can't break the others) and by the diagnostic Metro logs that surface the format/space choice plus sample raw values.
- **Rollback per concern**: every fix is independent. Reverting any one of {coord-space heuristic, top-K picker, EXIF rotation, orientation pass-through, video setBusy, render gate, calibration warning, model registry relaxation} doesn't break the others.

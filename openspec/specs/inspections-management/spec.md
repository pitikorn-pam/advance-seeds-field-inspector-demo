# inspections-management Specification

## Purpose
Manage the lifecycle of seed inspections — creation via mobile capture, real ML analysis, detail views, per-seed drill-down, metadata, overlays, and deletion.

## Requirements
### Requirement: Create inspection (mobile capture flow)
The mobile app SHALL allow an inspector to create a new inspection by selecting a variety, adding optional notes/location tagging, opening a single adaptive capture screen, running real YOLO26 segmentation inference on a captured camera frame, automatically applying LiDAR or ArUco calibration to produce real millimeter measurements, grading from the selected variety configuration, and persisting the resulting analysis.

#### Scenario: Happy-path capture with real ML and ArUco calibration
- **GIVEN** Jane is on the Home screen with the calibration card placed in front of the tray
- **WHEN** she taps "+ New inspection", chooses variety "Rice — Hom Mali", lets ArUco lock, and taps the shutter
- **THEN** the latest frame's YOLO26 detections are frozen
- **AND** the captured frame is uploaded to Supabase Storage
- **AND** an inspection row is created with `inspector_id`, image URL, calibration source "aruco", and seeds rows whose measurements were derived from the locked `pxPerMm`
- **AND** she lands on the Review screen showing the captured frame with segmentation polygon overlays when mask metadata exists, falling back to bbox only when no polygon is available

#### Scenario: Happy-path capture with LiDAR
- **GIVEN** Jane is on iPhone 12 Pro+ and holds the device 28 cm above the tray
- **WHEN** LiDAR streams a confident reading and she taps the shutter
- **THEN** a high-resolution photo is taken
- **AND** YOLO26 single-shot inference runs on the captured photo
- **AND** the inspection row is saved with calibration source "lidar" and the capture-time `pxPerMm`
- **AND** the user lands on the Review screen

#### Scenario: Cancel during capture discards nothing
- **WHEN** she backs out before the shutter
- **THEN** no inspection row is created
- **AND** any temporary captured frame on disk is cleaned up

#### Scenario: Cancel during setup discards nothing
- **GIVEN** Jane is on /capture/setup
- **WHEN** she taps the close button before tapping Continue
- **THEN** no inspection row is created
- **AND** the capture session is reset to defaults

### Requirement: Real analysis via SeedAnalyzer adapter
The mobile app SHALL produce inspection results through a `SeedAnalyzer` interface. Phase 1 SHALL use an on-device classical analyzer for captured JPEG photos, segment seed-like blobs, apply the committed ROI, convert pixels to millimeters using the active calibration `pxPerMm`, and fall back to `MockSeedAnalyzer` only when decoding or segmentation cannot produce usable detections. Later TFLite/Core ML implementations SHALL keep the same interface.

#### Scenario: Analyzer returns shape conformant with AnalysisResult
- **WHEN** the live analyzer is invoked on a frame
- **THEN** it returns `AnalysisFrameResult | null`
- **AND** when non-null, the result includes `summary` (total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2) and `seeds` (per-seed bounding boxes + measurements + grade) — same field shape as single-shot `AnalysisResult`

#### Scenario: Classical analyzer measures a captured photo
- **GIVEN** a captured JPEG has two seed-like foreground blobs and calibration is locked at 10 px/mm
- **WHEN** `ClassicalSeedAnalyzer.analyze()` runs
- **THEN** it returns two `AnalyzedSeed` rows
- **AND** each row's length, width, and area are converted from pixel measurements to millimeters using the supplied calibration
- **AND** the result `analyzerId` is `classical-cv-v1`

#### Scenario: Classical analyzer caps pixel workload
- **GIVEN** a captured JPEG is wider than the configured analysis width cap
- **WHEN** `ClassicalSeedAnalyzer.analyze()` runs
- **THEN** the analyzer downscales the pixel buffer before segmentation
- **AND** it adjusts `pxPerMm` by the same scale so millimeter measurements remain stable
- **AND** it logs decode time, analysis time, total time, frame size, analysis size, and detected seed count

#### Scenario: Analyzer grades from variety configuration
- **GIVEN** the selected variety has configured A/B/C grade criteria in millimeters
- **WHEN** analyzer maps detections into seeds
- **THEN** the analyzer evaluates the grade criteria in A, B, C order
- **AND** the first matching length/width range becomes the seed grade
- **AND** seeds outside every configured range map to `reject`
- **AND** when a variety has no `grade_criteria`, the analyzer falls back to legacy reference length/width targets

#### Scenario: Classical analyzer applies ROI
- **GIVEN** a committed ROI covers only part of the captured frame
- **WHEN** photo analysis runs
- **THEN** only seed detections whose bbox centroid is inside the ROI contribute to saved per-seed rows and summary values

#### Scenario: Analyzer is selected from an active installed model
- **GIVEN** the device has a verified active installed model artifact for its platform
- **WHEN** analysis starts
- **THEN** `selectAnalyzer()` instantiates the platform analyzer with that installed artifact
- **AND** a single info log records the analyzer ID and active model metadata

#### Scenario: Analyzer blocks when no active model is installed
- **GIVEN** the device has no verified active installed model artifact
- **WHEN** live or post-capture analysis starts
- **THEN** analyzer selection fails with a model-install-required error
- **AND** the app does not use a bundled detector fallback

#### Scenario: Android can activate a validated downloaded TFLite model
- **GIVEN** a local file URL or local HTTP model index exposes an Android `.tflite` candidate
- **WHEN** the user installs it from More → Model registry
- **THEN** the app downloads the manifest, metadata, and platform artifact into
  app document storage
- **AND** activation is blocked unless SHA-256 and metadata compatibility
  checks pass and the model loads for a smoke inference
- **AND** Android single-shot and live TFLite paths load the active installed
  model file, blocking inspection if no active model is valid
- **AND** the user can roll back to the previous active model

#### Scenario: iOS can activate a validated downloaded Core ML package
- **GIVEN** the dashboard deployment API or a local model index exposes an iOS
  `.mlpackage.zip` candidate
- **WHEN** the user installs it from More → Model registry
- **THEN** the app downloads the package, verifies its SHA-256, extracts the
  `.mlpackage`, compiles it to `.mlmodelc`, and smoke-loads it with Core ML
- **AND** iOS single-shot and live Core ML paths load the active installed
  compiled model, blocking inspection if no active model is valid
- **AND** the user can roll back to the previous active model

#### Scenario: Mobile consumes dashboard model deployment services
- **GIVEN** Supabase public environment values are configured for the dashboard
  model-registry project
- **WHEN** the app refreshes More → Model registry for staging or production
- **THEN** it SHALL call the dashboard `list-deployed-models` service through a
  shared mobile model-registry service wrapper
- **AND** that wrapper SHALL also expose `resolve-channel` for default-model
  update checks
- **AND** the screen SHALL keep a manual index URL input as an offline/local
  testing fallback

#### Scenario: CoreML analyzer is preferred on iPhone with Neural Engine
- **GIVEN** the device is iPhone 12 Pro+ and a verified active installed Core ML artifact exists
- **WHEN** analysis starts
- **THEN** `selectAnalyzer()` prefers `CoreMLSeedAnalyzer` over Tflite
- **AND** the registered analyzer ID reflects the active Core ML YOLO runtime

#### Scenario: Mock fallback when real analysis is unavailable
- **GIVEN** the app cannot decode the captured image or the analyzer finds no usable seed-like blobs
- **WHEN** `ClassicalSeedAnalyzer.analyze()` runs
- **THEN** it falls back to `MockSeedAnalyzer` and logs a warning explaining the fallback
- **AND** the result `analyzerId` includes the fallback analyzer ID for traceability

### Requirement: List inspections with filters
The mobile app SHALL provide an inspections list with filters by variety, date range, and (admin only) inspector, plus a search field.

#### Scenario: Inspector sees only own inspections
- **GIVEN** Jane is signed in
- **WHEN** she opens the Inspections list
- **THEN** every row's `inspector_id` equals her id

#### Scenario: Admin filters by inspector
- **GIVEN** Alex is signed in
- **WHEN** he selects "Inspector: Jane" from the filter
- **THEN** only Jane's inspections are listed

### Requirement: Inspection detail and per-seed view
The mobile app SHALL show an inspection detail screen with the captured frame, summary measurements, segmentation-aware overlays, a per-seed grid with thumbnails cropped from the source image, and a tap-through to a full-screen per-seed detail view.

#### Scenario: Per-seed thumbnail is a real crop from the source image
- **GIVEN** an inspection has 18 seeds with bounding boxes
- **WHEN** the user opens its detail screen
- **THEN** each per-seed thumbnail is a crop of the captured image at that seed's bbox, NOT a generic placeholder

#### Scenario: Tapping a seed thumbnail opens its full-screen detail
- **WHEN** the user taps any seed thumbnail
- **THEN** a full-screen route `/inspections/seed/[index]` opens
- **AND** the screen shows the source image with the saved segment polygon when available, otherwise bbox fallback
- **AND** the hero annotation shows detected class label, length, area, and volume
- **AND** the measurement section shows length / width / area / volume / grade

### Requirement: Review screen with segmentation overlay
After capture, the mobile app SHALL show a Review screen with the captured frame overlaid by segmentation polygons when mask metadata exists, a bbox fallback when not, summary stat tiles, and Save / Discard actions before the inspection is committed.

#### Scenario: Review renders detected shapes over image
- **WHEN** capture completes and the app routes to Review
- **THEN** the captured image is rendered with SVG polygons for each detected seed that has a saved mask
- **AND** bbox rectangles render only for seeds without a mask polygon
- **AND** each annotation prefers the detected class label and includes length, area, and volume when available
- **AND** the summary shows total seeds + mean length/width/area
- **AND** "Save" persists the inspection; "Discard" deletes the upload and returns to Setup

#### Scenario: Result seed list is virtualized
- **GIVEN** the analyzer returns many per-seed rows
- **WHEN** the Inspection Result page renders
- **THEN** the per-seed list uses a virtualized list with bounded initial render and batch sizes
- **AND** scrolling loads additional seed rows lazily without blocking the initial result screen

#### Scenario: Detail seed grid is virtualized and filterable
- **GIVEN** an inspection has saved seeds across grades A, B, C, and reject
- **WHEN** the Inspection Detail page renders
- **THEN** the per-seed grid uses a virtualized multi-column list
- **AND** grade chips let the user filter by All, A, B, C, or Reject
- **AND** the filtered count is shown without changing saved inspection data

#### Scenario: Android recorded video includes ROI overlay
- **GIVEN** the user records Live capture on Android with a committed Rect, Polygon, or Circle ROI
- **WHEN** processing uploads the recording
- **THEN** the Android ROI video exporter creates an MP4 with the ROI drawn into the video frames before upload
- **AND** the resulting Inspection Result, Inspection Detail, share, and Recordings playback use the annotated video

### Requirement: Capture metadata
The mobile app SHALL carry capture metadata from Inspection Result into Inspection Detail for both photo and video captures.

#### Scenario: Capture metadata is compact by default
- **WHEN** the Result or Detail page renders capture metadata
- **THEN** the metadata card is collapsed by default and shows only the key rows: location summary when present, device, capture mode, and media type
- **AND** tapping Show more expands full GPS, device, app/runtime, camera, flash, ROI, and capture timestamp fields

#### Scenario: GPS location name is preferred
- **GIVEN** Auto-tag location is enabled and GPS resolves successfully
- **WHEN** the inspection is saved
- **THEN** metadata includes latitude, longitude, accuracy, timestamp, and best-effort reverse-geocoded place/address fields
- **AND** the collapsed metadata row shows the place/address name when available, falling back to coordinates

#### Scenario: Device and camera metadata is persisted
- **WHEN** an inspection is saved
- **THEN** `inspections.metadata` records device name, platform/OS, app version/build, runtime version, capture mode, media type, camera position, flash mode, ROI type, and capture timestamp
- **AND** photo and video captures preserve the correct media type through result, detail, and share flows

#### Scenario: Deleted linked video falls back to captured thumbnail
- **GIVEN** a video inspection references a recording that was deleted later
- **WHEN** the operator opens the inspection detail
- **THEN** the media preview renders `inspections.image_url` as a still thumbnail
- **AND** it does not attempt to play the deleted `recordings` video URL
- **AND** share uses annotated image export instead of video sharing

### Requirement: Update inspection notes
The owner of an inspection (inspector or admin) SHALL be able to edit the inspection's notes field.

#### Scenario: Inspector edits own notes
- **GIVEN** Jane owns inspection X
- **WHEN** she edits notes and saves
- **THEN** the row's `notes` field is updated and visible on reload

### Requirement: Delete own inspection
An inspector SHALL be able to delete their own inspection. An admin SHALL NOT be able to delete other inspectors' inspections.

#### Scenario: Inspector deletes own inspection
- **GIVEN** Jane owns inspection X
- **WHEN** she confirms delete in the UI
- **THEN** the row is removed and she returns to the list

#### Scenario: Admin delete on other's row blocked
- **GIVEN** Alex is admin and inspection X is owned by Jane
- **WHEN** he attempts to delete X
- **THEN** the action is unavailable in UI and would be denied by RLS if attempted directly

### Requirement: Analyzer model snapshot on every inspection
Each inspection's `metadata.analyzer_model` SHALL capture which detector, class labels, and threshold tuning produced its results, frozen at capture time.

#### Scenario: Inspection records the active model
- **GIVEN** the operator captures with the registry model `0.3.2` from the production channel
- **WHEN** the inspection is saved
- **THEN** `metadata.analyzer_model` contains `id` (`production-{version_id}-{platform}`), `display_name` (`0.3.2`), `source` (`production`), `model_name` (`yolo26n-seg`), `version` (`0.3.2`), `analyzer_runtime` (`coreml-yolo`), `class_names`, and the active `score_threshold` + `iou_threshold`

#### Scenario: Inspection persists segment annotation metadata
- **GIVEN** the analyzer returns seeds with mask polygons, class ids, and volume estimates
- **WHEN** the inspection is saved
- **THEN** `inspections.metadata.seed_masks` stores each seed index with its mask polygon
- **AND** it stores the detected `class_id`, resolved class label, and `volume_ml` when available
- **AND** saved inspection and seed detail pages can render class-aware polygon annotations without re-running analysis

#### Scenario: Inspection cannot be saved from model-backed analysis without active model metadata
- **GIVEN** no registry model is active
- **WHEN** the inspector attempts model-backed capture or post-capture analysis
- **THEN** the app blocks the workflow before saving an inspection result
- **AND** saved model-backed inspections always include `metadata.analyzer_model.source` from the active installed model

#### Scenario: Result + Detail surfaces the snapshot
- **GIVEN** an inspection with `analyzer_model` metadata
- **WHEN** the operator opens either the capture-review screen or the inspection-detail screen
- **THEN** the metadata block renders a "Detector model" row (collapsed: `0.3.2 · Production`; expanded: runtime + trained-as + thresholds)
- **AND** the metadata block uses thin section dividers between Location / Device / Capture / Detector groups

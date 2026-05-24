## MODIFIED Requirements

### Requirement: Create inspection (mobile capture flow)
The mobile app SHALL allow an inspector to create a new inspection by choosing a detector filter (`ALL` or a model class), adding optional notes/location tagging, opening a single adaptive capture screen, running real YOLO26 segmentation inference on a captured camera frame, automatically applying LiDAR or ArUco calibration to produce real millimeter measurements, preserving detected class identity per seed/object, and persisting the resulting analysis.

#### Scenario: Happy-path capture with real ML and ArUco calibration
- **GIVEN** Jane is on capture setup with the calibration card placed in front of the tray
- **WHEN** she chooses detector filter `ALL`, lets ArUco lock, and taps the shutter
- **THEN** the latest frame's YOLO26 detections are frozen
- **AND** the captured frame is uploaded to Supabase Storage
- **AND** post-shutter analysis runs without a detector class filter
- **AND** an inspection row is created with `inspector_id`, image URL, calibration source "aruco", detector filter metadata, class breakdown metadata, and seed rows whose measurements were derived from the locked `pxPerMm`
- **AND** each saved seed row preserves its detected class id and class name when model-backed analysis provides them
- **AND** she lands on the Review screen showing the captured frame with segmentation polygon overlays when mask metadata exists, falling back to bbox only when no polygon is available

#### Scenario: Happy-path capture with a selected detector class
- **GIVEN** the active model exposes class names `banana` and `watermelon`
- **WHEN** Jane chooses detector filter `banana`, completes calibration, and taps the shutter
- **THEN** live and post-shutter analysis use the `banana` class index filter
- **AND** the saved inspection contains only detections matching the selected class filter
- **AND** `inspections.metadata.detector_filter` records the selected class name and class id

#### Scenario: Happy-path capture with LiDAR
- **GIVEN** Jane is on iPhone 12 Pro+ and holds the device 28 cm above the tray
- **WHEN** LiDAR streams a confident reading and she taps the shutter
- **THEN** a high-resolution photo is taken
- **AND** YOLO26 single-shot inference runs on the captured photo using the selected detector filter
- **AND** the inspection row is saved with calibration source "lidar", capture-time `pxPerMm`, detector filter metadata, and per-seed detected class identity
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
The mobile app SHALL produce inspection results through a `SeedAnalyzer` interface. Model-backed analyzers SHALL accept an optional detector class filter, return per-seed detected class ids when available, reconstruct segmentation masks when available, apply the committed ROI, convert pixels to millimeters using the active calibration `pxPerMm`, and keep the same `AnalysisResult` / `AnalysisFrameResult` field shape across Core ML and TFLite implementations.

#### Scenario: Analyzer returns shape conformant with AnalysisResult
- **WHEN** the live analyzer is invoked on a frame
- **THEN** it returns `AnalysisFrameResult | null`
- **AND** when non-null, the result includes `summary` (total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2) and `seeds` (per-seed bounding boxes + measurements + grade) — same field shape as single-shot `AnalysisResult`

#### Scenario: Model-backed analyzer preserves detected class identity
- **GIVEN** a model-backed analyzer decodes detections with class ids
- **WHEN** it maps detections into analyzed seeds
- **THEN** every seed whose source detection had a class id preserves that class id
- **AND** the save pipeline resolves the corresponding class name from the active model metadata

#### Scenario: Analyzer grades from mapped class or fallback configuration
- **GIVEN** a detected class can be mapped to a variety reference row with configured grade criteria
- **WHEN** analyzer maps detections into seeds
- **THEN** the analyzer evaluates the mapped grade criteria in A-H order
- **AND** the first matching length/width range becomes the seed grade
- **AND** seeds outside every configured range map to `reject`
- **AND** when no class-to-variety grading configuration is available, the analyzer falls back to generic grading behavior

#### Scenario: Analyzer applies ROI
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

### Requirement: Inspection detail and per-seed view
The mobile app SHALL show an inspection detail screen with the captured frame, summary measurements, segmentation-aware overlays, a per-seed grid with thumbnails cropped from the source image, detected class filters when class data exists, and a tap-through to a full-screen per-seed detail view.

#### Scenario: Per-seed thumbnail is a real crop from the source image
- **GIVEN** an inspection has 18 seeds with bounding boxes
- **WHEN** the user opens its detail screen
- **THEN** each per-seed thumbnail is a crop of the captured image at that seed's bbox, NOT a generic placeholder

#### Scenario: Detail seed grid filters by detected class
- **GIVEN** an inspection has saved seed rows with class names `banana` and `watermelon`
- **WHEN** the Inspection Detail page renders
- **THEN** the per-seed grid exposes class filter chips for All, banana, and watermelon
- **AND** choosing banana shows only seed thumbnails whose saved class name is banana
- **AND** the filtered count is shown without changing saved inspection data

#### Scenario: Legacy detail without class data remains readable
- **GIVEN** an older inspection has saved seed rows without class id or class name
- **WHEN** the Inspection Detail page renders
- **THEN** the per-seed grid renders the saved thumbnails and grade filters as before
- **AND** class filter chips are hidden or disabled

#### Scenario: Tapping a seed thumbnail opens its full-screen detail
- **WHEN** the user taps any seed thumbnail
- **THEN** a full-screen route `/inspections/seed/[index]` opens
- **AND** the screen shows the source image with the saved segment polygon when available, otherwise bbox fallback
- **AND** the hero annotation shows detected class label when available, length, area, and volume
- **AND** the measurement section shows length / width / area / volume / grade

### Requirement: Review screen with segmentation overlay
After capture, the mobile app SHALL show a Review screen with the captured frame overlaid by segmentation polygons when mask metadata exists, a bbox fallback when not, detected class breakdown, summary stat tiles, and Save / Discard actions before the inspection is committed.

#### Scenario: Review renders detected shapes over image
- **WHEN** capture completes and the app routes to Review
- **THEN** the captured image is rendered with SVG polygons for each detected seed that has a saved mask
- **AND** bbox rectangles render only for seeds without a mask polygon
- **AND** each annotation prefers the detected class label and includes length, area, and volume when available
- **AND** the summary shows total seeds + mean length/width/area
- **AND** "Save" persists the inspection; "Discard" deletes the upload and returns to Setup

#### Scenario: Review shows class breakdown for ALL captures
- **GIVEN** the inspector captured with detector filter `ALL`
- **AND** analysis found banana and watermelon detections
- **WHEN** the Review screen renders
- **THEN** it shows a class breakdown with counts for banana and watermelon
- **AND** Save does not require the user to choose a single inspection-level variety

#### Scenario: Result seed list is virtualized
- **GIVEN** the analyzer returns many per-seed rows
- **WHEN** the Inspection Result page renders
- **THEN** the per-seed list uses a virtualized list with bounded initial render and batch sizes
- **AND** scrolling loads additional seed rows lazily without blocking the initial result screen

### Requirement: Analyzer model snapshot on every inspection
Each inspection's `metadata.analyzer_model` SHALL capture which detector, class labels, and threshold tuning produced its results, frozen at capture time.

#### Scenario: Inspection records the active model
- **GIVEN** the operator captures with the registry model `0.3.2` from the production channel
- **WHEN** the inspection is saved
- **THEN** `metadata.analyzer_model` contains `id` (`production-{version_id}-{platform}`), `display_name` (`0.3.2`), `source` (`production`), `model_name` (`yolo26n-seg`), `version` (`0.3.2`), `analyzer_runtime` (`coreml-yolo`), `class_names`, and the active `score_threshold` + `iou_threshold`

#### Scenario: Inspection persists segment annotation metadata
- **GIVEN** the analyzer returns seeds with mask polygons, class ids, class names, and volume estimates
- **WHEN** the inspection is saved
- **THEN** `inspections.metadata.seed_masks` stores each seed index with its mask polygon
- **AND** it stores the detected `class_id`, resolved class label, and `volume_ml` when available
- **AND** saved inspection and seed detail pages can render class-aware polygon annotations without re-running analysis

#### Scenario: Inspection records detector filter metadata
- **GIVEN** the operator captures with detector filter `ALL`
- **WHEN** the inspection is saved
- **THEN** `inspections.metadata.detector_filter` records mode `all`
- **AND** `inspections.metadata.class_breakdown` records each detected class name and count

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

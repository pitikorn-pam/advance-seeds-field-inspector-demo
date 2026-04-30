# Spec — inspections-management (delta)

## MODIFIED Requirements

### Requirement: Create inspection (mobile capture flow)
The mobile app SHALL allow an inspector to create a new inspection by selecting variety, optional batch, and capture mode (Live or Precise), running real YOLOv11n inference on a real captured camera frame, automatically applying LiDAR or ArUco calibration to produce real millimeter measurements, and persisting the resulting analysis.

#### Scenario: Happy-path Live capture with real ML and ArUco calibration
- **GIVEN** Jane is on the Home screen with the calibration card placed in front of the tray
- **WHEN** she taps "+ New inspection", chooses variety "Rice — Hom Mali", batch "BATCH-2026-04", mode "Live", lets ArUco lock, and taps the shutter
- **THEN** the latest frame's YOLOv11n detections are frozen
- **AND** the captured frame is uploaded to Supabase Storage
- **AND** an inspection row is created with `inspector_id`, image URL, calibration source "aruco", and seeds rows whose measurements were derived from the locked `pxPerMm`
- **AND** she lands on the Review screen showing the captured frame with bounding-box overlays

#### Scenario: Happy-path Precise capture with LiDAR
- **GIVEN** Jane is on iPhone 12 Pro+ in precise mode and holds the device 28 cm above the tray
- **WHEN** LiDAR locks and she taps the shutter
- **THEN** a high-resolution photo is taken
- **AND** YOLOv11n single-shot inference runs on the captured photo
- **AND** the inspection row is saved with calibration source "lidar" and the locked `pxPerMm`
- **AND** the user lands on the Review screen

#### Scenario: Cancel during capture discards nothing
- **WHEN** she backs out before the shutter
- **THEN** no inspection row is created
- **AND** any temporary captured frame on disk is cleaned up

### Requirement: Real analysis via SeedAnalyzer adapter
The mobile app SHALL produce inspection results through a `SeedAnalyzer` interface implemented by a real on-device inference engine — TFLite (cross-platform) or Core ML (iOS, Apple Neural Engine when available) — selected at runtime by `selectAnalyzer()`. The interface SHALL support both single-shot `analyze` (precise mode) and streaming `analyzeFrame` (live mode).

#### Scenario: Analyzer returns shape conformant with AnalysisResult
- **WHEN** the live analyzer is invoked on a frame
- **THEN** it returns `AnalysisFrameResult | null`
- **AND** when non-null, the result includes `summary` (total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2) and `seeds` (per-seed bounding boxes + measurements + grade) — same field shape as single-shot `AnalysisResult`

#### Scenario: TFLite analyzer is preferred when the model loads
- **GIVEN** `apps/mobile/assets/models/yolo11n-seeds.tflite` is bundled
- **WHEN** the app starts
- **THEN** `selectAnalyzer()` instantiates `TfliteSeedAnalyzer` and registers it with `AnalyzerProvider`
- **AND** a single info log records the analyzer ID (e.g. "tflite-yolo11n")

#### Scenario: CoreML analyzer is preferred on iPhone with Neural Engine
- **GIVEN** the device is iPhone 12 Pro+ AND `yolo11n-seeds.mlpackage` is bundled
- **WHEN** the app starts
- **THEN** `selectAnalyzer()` prefers `CoreMLSeedAnalyzer` over Tflite
- **AND** the registered analyzer ID is "coreml-yolo11n"

#### Scenario: Mock fallback when no real analyzer is available
- **GIVEN** the app cannot load the bundled model (file missing, GPU init fails)
- **WHEN** `selectAnalyzer()` runs
- **THEN** it falls back to `MockSeedAnalyzer` and logs a warning explaining the fallback
- **AND** `analyzeFrame` still returns conformant results (deterministic mocks)

### Requirement: Inspection detail and per-seed view
The mobile app SHALL show an inspection detail screen with the captured frame, summary measurements, a per-seed grid with bounding-box thumbnails cropped from the source image, and a tap-through to a full-screen per-seed detail view.

#### Scenario: Per-seed thumbnail is a real crop from the source image
- **GIVEN** an inspection has 18 seeds with bounding boxes
- **WHEN** the user opens its detail screen
- **THEN** each per-seed thumbnail is a crop of the captured image at that seed's bbox, NOT a generic placeholder

#### Scenario: Tapping a seed thumbnail opens its full-screen detail
- **WHEN** the user taps any seed thumbnail
- **THEN** a full-screen route `/inspections/seed/[index]` opens
- **AND** the screen shows a larger crop, length / width / area / grade, defects, and prev/next navigation between seeds in the same inspection

## ADDED Requirements

### Requirement: Review screen with bounding-box overlay
After capture, the mobile app SHALL show a Review screen with the captured frame overlaid by colored bounding boxes (Grade A green, B blue, C amber, reject red), summary stat tiles, and Save / Discard actions before the inspection is committed.

#### Scenario: Review renders boxes over image
- **WHEN** capture completes and the app routes to Review
- **THEN** the captured image is rendered with SVG bounding boxes for each detected seed
- **AND** the summary shows total seeds + mean length/width/area
- **AND** "Save" persists the inspection; "Discard" deletes the upload and returns to Setup

### Requirement: Inspection note and capture metadata
The mobile app SHALL carry setup notes and capture metadata from Inspection Result into Inspection Detail for both photo and video captures.

#### Scenario: Result and detail show setup note
- **GIVEN** the inspector enters a note during setup
- **WHEN** capture completes and the Result page opens
- **THEN** the Result page shows the note in a dedicated Note section
- **AND** after save, the Inspection Detail page shows the same note from `inspections.notes`

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

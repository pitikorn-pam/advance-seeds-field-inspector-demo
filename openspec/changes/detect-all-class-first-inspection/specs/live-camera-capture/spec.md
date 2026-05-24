## MODIFIED Requirements

### Requirement: Unified live capture
The mobile app SHALL provide a unified capture screen that runs YOLO inference on sampled camera frames at ≥ 5 fps and renders detection rings over the preview in real time. The capture flow SHALL accept a detector filter selected during setup: `ALL` runs without a class filter, while a selected model class restricts live inference and overlays to that class.

#### Scenario: Live detections animate over the preview
- **GIVEN** the user has selected detector filter `ALL` and is in capture
- **WHEN** they hold the camera over a tray containing multiple model classes
- **THEN** colored segment polygons appear around every detected seed/object class within 200 ms of the object entering the frame when the model exposes masks
- **AND** bbox rectangles are used only as a fallback when no polygon is available
- **AND** labels prefer the detected model class name and include length, area, and volume when available
- **AND** the KPI strip updates count, average length, average area/volume, and Grade A continuously
- **AND** the overlay projection uses the actual native frame dimensions returned with the live detection result rather than a hard-coded camera size

#### Scenario: Selected detector class filters live overlay
- **GIVEN** the active model exposes class names `banana` and `watermelon`
- **AND** the user selects detector filter `banana`
- **WHEN** live inference processes a frame containing both classes
- **THEN** the app passes only the `banana` model class index to the live analyzer
- **AND** the overlay, KPI strip, and captured live frame result include banana detections only

#### Scenario: ALL detector filter keeps analyzer class filter empty
- **GIVEN** the user selects detector filter `ALL`
- **WHEN** live inference starts
- **THEN** the app passes no detector class filter to the live analyzer
- **AND** native mask polygon decoding receives an empty class filter

#### Scenario: Live shutter persists the latest frame
- **WHEN** the user taps the shutter in live mode
- **THEN** the most recent frame's detections matching the selected detector filter are frozen
- **AND** the captured frame is uploaded to `inspection-images/<uuid>.jpg`
- **AND** processing re-runs post-shutter analysis with the same detector filter
- **AND** the user navigates to the review screen

## ADDED Requirements

### Requirement: Detector filter setup
The mobile app SHALL let the inspector choose a detector filter before opening the camera. The filter list SHALL include `ALL` and the active installed model's class names.

#### Scenario: Setup defaults to ALL
- **GIVEN** a verified active installed model exposes class names
- **WHEN** the user opens `/capture/setup` from the Inspect tab
- **THEN** detector filter `ALL` is selected by default
- **AND** Continue is enabled once model and camera preflight checks pass
- **AND** selecting a variety is not required to continue

#### Scenario: Setup lists active model classes
- **GIVEN** the active installed model metadata includes class names `banana` and `watermelon`
- **WHEN** the user opens the detector filter control
- **THEN** the options include `ALL`, `banana`, and `watermelon`
- **AND** every visible option label is localized through the app i18n layer

#### Scenario: Missing model blocks detector filter setup
- **GIVEN** no verified active installed model is available
- **WHEN** the user opens capture setup or taps Inspect
- **THEN** the app blocks capture with the model-install-required flow
- **AND** it does not fall back to bundled detector classes for model-backed inspection

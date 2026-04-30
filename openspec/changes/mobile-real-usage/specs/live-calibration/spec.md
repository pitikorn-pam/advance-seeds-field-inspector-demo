# Spec — live-calibration

## ADDED Requirements

### Requirement: Per-frame calibration via the LiveCalibrator interface
The mobile app SHALL expose a `LiveCalibrator` interface that observes camera frames and emits `CalibrationReading` values consumed by the analyzer to produce real millimeter measurements.

#### Scenario: Calibrator returns null when no calibration is detectable
- **GIVEN** the calibrator is observing frames and no LiDAR / ArUco signal is present
- **WHEN** a frame is observed
- **THEN** `observe(frame)` returns `null`
- **AND** capture remains gated until an automatic calibration source locks

#### Scenario: Calibrator returns a reading with confidence
- **GIVEN** a 5 cm ArUco marker is visible in the frame
- **WHEN** the ArUco calibrator observes the frame
- **THEN** it returns `{ pxPerMm: number, source: "aruco", confidence: 0..1, observedAtMs: number }`
- **AND** the value is mathematically consistent with the marker's pixel size in the frame

### Requirement: LiDAR calibration on supported iOS devices
On iOS devices with a LiDAR sensor, the mobile app SHALL provide a `LidarCalibrator` that derives `pxPerMm` from depth + camera intrinsics.

#### Scenario: LiDAR locks at 28 cm distance
- **GIVEN** the user is in precise mode on an iPhone or iPad with a LiDAR sensor
- **WHEN** they hold the device 28 cm above a tray
- **THEN** the calibration banner shows "Calibration locked" with a LiDAR-derived px/mm value and "28 cm"
- **AND** confidence is ≥ 0.6

#### Scenario: LiDAR unsupported — ArUco fallback is selected automatically
- **GIVEN** a device without a LiDAR sensor (iPhone < 12 Pro, all Android)
- **WHEN** the user opens Live or Precise capture
- **THEN** `LidarCalibrator` is NOT registered
- **AND** the capture screen falls back to ArUco marker calibration without requiring a setup selection

#### Scenario: LiDAR cannot lock on a supported iOS device
- **GIVEN** the user is in precise mode on an iOS device with LiDAR
- **WHEN** ARKit scene depth is unavailable or confidence is below 0.6
- **THEN** the shutter remains gated by automatic calibration
- **AND** the capture screen falls back to ArUco if LiDAR cannot start

### Requirement: ArUco marker calibration cross-platform
The mobile app SHALL provide an `ArucoCalibrator` that detects a 5 cm × 5 cm ArUco marker (DICT_4X4_50, marker ID 0) in camera frames and computes `pxPerMm` from its pixel size.

#### Scenario: Marker detected in frame
- **GIVEN** the user has placed the calibration card in the camera frame
- **WHEN** the ArUco calibrator observes the frame
- **THEN** the marker is detected and `pxPerMm` is computed from its pixel diagonal
- **AND** the calibration pill shows "ArUco locked"

#### Scenario: Android live ArUco detection stays within native memory limits
- **GIVEN** Android live or precise capture is observing camera frames for ArUco calibration
- **WHEN** the user repeatedly enters and exits the camera or keeps the marker in frame for an extended scan
- **THEN** the OpenCV detector reuses native detector state and bounded-size frame mats
- **AND** the app does not crash with native OpenCV memory exhaustion

#### Scenario: User shares the ArUco marker
- **GIVEN** the user is viewing the Calibration menu
- **WHEN** they tap "Download calibration card" in the ArUco marker section
- **THEN** the app opens the platform share sheet with the bundled 5 cm ArUco calibration card PNG
- **AND** the card image keeps a visible white quiet zone around the marker for camera detection
- **AND** another inspector can save, share, or print the same calibration card

#### Scenario: Marker not detected
- **GIVEN** the marker is occluded or absent
- **WHEN** the calibrator observes the frame
- **THEN** it returns null and the calibration pill shows "Place ArUco card in frame"

### Requirement: Calibration is automatic during capture
The mobile app SHALL NOT require inspectors to select a calibration profile during New inspection setup. Capture SHALL auto-select the best available calibration source based on device capability and marker visibility.

#### Scenario: New inspection setup has no calibration selector
- **GIVEN** the user opens New inspection
- **WHEN** setup fields are rendered
- **THEN** the form asks for variety, optional batch, notes, and location tagging
- **AND** no "Select calibration" control is shown

#### Scenario: Supported LiDAR device auto-selects LiDAR
- **GIVEN** the user opens Live or Precise capture on an iOS device with LiDAR
- **WHEN** LiDAR produces a confidence ≥ 0.6 reading
- **THEN** the app stores a calibration reading with source "lidar"
- **AND** the user can capture without placing an ArUco marker in frame

#### Scenario: Non-LiDAR device auto-selects ArUco
- **GIVEN** the user opens Live or Precise capture on a device without LiDAR
- **WHEN** the bundled ArUco marker is visible and confidence is ≥ 0.6
- **THEN** the app stores a calibration reading with source "aruco"
- **AND** the user can capture without choosing a calibration profile

### Requirement: Calibration metadata persisted with inspection
Every inspection row SHALL store the calibration source and value used at capture time.

#### Scenario: Inspection row has calibration metadata
- **GIVEN** an inspection is captured with LiDAR locked at 24.7 px/mm
- **WHEN** the row is saved
- **THEN** `inspection.calibration_id` may be null when the source is automatic
- **AND** the captured source, confidence, and `pxPerMm` are recorded in metadata for traceability

# Spec — live-calibration

## ADDED Requirements

### Requirement: Per-frame calibration via the LiveCalibrator interface
The mobile app SHALL expose a `LiveCalibrator` interface that observes camera frames and emits `CalibrationReading` values consumed by the analyzer to produce real millimeter measurements.

#### Scenario: Calibrator returns null when no calibration is detectable
- **GIVEN** the calibrator is observing frames and no LiDAR / ArUco signal is present
- **WHEN** a frame is observed
- **THEN** `observe(frame)` returns `null`
- **AND** the analyzer falls back to the user's selected manual calibration profile

#### Scenario: Calibrator returns a reading with confidence
- **GIVEN** a 5 cm ArUco marker is visible in the frame
- **WHEN** the ArUco calibrator observes the frame
- **THEN** it returns `{ pxPerMm: number, source: "aruco", confidence: 0..1, observedAtMs: number }`
- **AND** the value is mathematically consistent with the marker's pixel size in the frame

### Requirement: LiDAR calibration on supported iOS devices
On iOS devices with a LiDAR sensor, the mobile app SHALL provide a `LidarCalibrator` that derives `pxPerMm` from depth + camera intrinsics.

#### Scenario: LiDAR locks at 28 cm distance
- **GIVEN** the user is in precise mode on an iPhone 12 Pro+
- **WHEN** they hold the device 28 cm above a tray
- **THEN** the calibration pill shows "LiDAR locked / 24.7 px/mm at 28 cm"
- **AND** confidence is ≥ 0.8

#### Scenario: LiDAR unsupported — calibrator is not registered
- **GIVEN** a device without a LiDAR sensor (iPhone < 12 Pro, all Android)
- **WHEN** the calibrator picker runs at startup
- **THEN** `LidarCalibrator` is NOT registered
- **AND** the picker falls back to ArUco or Manual

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

### Requirement: Manual fallback when no live calibration is available
When no automatic calibration is detected, the mobile app SHALL use the user's selected calibration profile and surface this state honestly via the calibration pill.

#### Scenario: Manual fallback after 3 seconds without lock
- **GIVEN** the user enters live mode and neither LiDAR nor ArUco produces a reading in 3 seconds
- **WHEN** the timeout elapses
- **THEN** the manual calibrator emits the selected profile's `pxPerMm`
- **AND** the calibration pill shows "Calibration unavailable — measurements may be approximate" with the source set to "manual"
- **AND** measurements are still produced but flagged in the inspection's metadata

### Requirement: Calibration metadata persisted with inspection
Every inspection row SHALL store the calibration source and value used at capture time.

#### Scenario: Inspection row has calibration metadata
- **GIVEN** an inspection is captured with LiDAR locked at 24.7 px/mm
- **WHEN** the row is saved
- **THEN** `inspection.calibration_id` is set to the matching profile (creating a synthetic profile if needed)
- **AND** the captured `pxPerMm` is recorded for traceability

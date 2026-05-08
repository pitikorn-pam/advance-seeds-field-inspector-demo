# live-calibration Specification

## Purpose
Provide automatic per-frame calibration (LiDAR, ArUco, manual fallback) so seed measurements are in real millimeters without manual profile selection.

## Requirements
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
On iOS devices with a LiDAR sensor, the mobile app SHALL provide a `LidarCalibrator` that derives `pxPerMm` from depth + camera intrinsics. LiDAR readings stream **continuously** at 10 Hz with EMA smoothing — operators move the device freely and `pxPerMm` updates per frame, recomputing seed measurements without a stand-still lock phase.

#### Scenario: LiDAR streams updated readings as the operator moves
- **GIVEN** the user is in capture on an iPhone Air / iPad Pro / iPhone 12+ Pro
- **WHEN** they shift the camera from 30 cm to 18 cm above a tray over 2 s
- **THEN** the calibration banner pxPerMm + distance label update smoothly across the move
- **AND** the live overlay's seed-size measurements track the new working distance without an explicit re-calibrate gesture
- **AND** EMA smoothing absorbs single-frame depth noise without freezing the value

#### Scenario: First confident reading dismisses the calibration overlay
- **GIVEN** the user opens capture on a LiDAR device
- **WHEN** the first reading at confidence ≥ 0.6 lands
- **THEN** the calibrating-depth onboarding overlay dismisses
- **AND** subsequent live LiDAR readings flow into the bottom calibration banner without re-entering the overlay within the same session

#### Scenario: LiDAR unsupported — ArUco fallback is selected automatically
- **GIVEN** a device without a LiDAR sensor (iPhone < 12 Pro, all Android)
- **WHEN** the user opens capture
- **THEN** `LidarCalibrator` is NOT registered
- **AND** the capture screen falls back to ArUco marker calibration without requiring a setup selection

#### Scenario: LiDAR cannot lock on a supported iOS device
- **GIVEN** the user is in capture on an iOS device with LiDAR
- **WHEN** ARKit scene depth is unavailable or confidence is below 0.6
- **THEN** the shutter remains gated by automatic calibration
- **AND** the capture screen falls back to ArUco if LiDAR cannot start or no reading arrives within 1.6 seconds
- **AND** the initial depth-calibration overlay does not permanently block the ArUco frame processor after that fallback window

### Requirement: ArUco marker calibration cross-platform
The mobile app SHALL provide an `ArucoCalibrator` that detects a 5 cm × 5 cm ArUco marker (DICT_4X4_50, marker ID 0) in camera frames and computes `pxPerMm` from its pixel size.

#### Scenario: Marker detected in frame
- **GIVEN** the user has placed the calibration card in the camera frame
- **WHEN** the ArUco calibrator observes the frame
- **THEN** the marker is detected and `pxPerMm` is computed from its pixel diagonal
- **AND** the calibration pill shows "ArUco locked"

#### Scenario: Marker reacquisition adapts calibration dynamically
- **GIVEN** ArUco calibration has locked once and the marker leaves the frame
- **WHEN** the marker becomes visible again at a different working distance
- **THEN** the calibrator continues scanning and publishes an updated rolling-median `pxPerMm`
- **AND** the live detector uses the updated reading without a manual re-calibrate action

#### Scenario: Android live ArUco detection stays within native memory limits
- **GIVEN** Android live or precise capture is observing camera frames for ArUco calibration
- **WHEN** the user repeatedly enters and exits the camera or keeps the marker in frame for an extended scan
- **THEN** the OpenCV detector reuses native detector state and bounded-size frame mats
- **AND** the app does not crash with native OpenCV memory exhaustion

#### Scenario: Android live ArUco native errors fail closed
- **GIVEN** Android live or precise capture is observing camera frames for ArUco calibration
- **WHEN** OpenCV loading, frame conversion, or marker detection throws inside the native frame-processor callback
- **THEN** the native plugin logs the frame-processing error
- **AND** returns `null` for that frame
- **AND** the app keeps the camera route open instead of terminating the release build

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
- **THEN** the form asks for variety, notes, and location tagging
- **AND** no "Select calibration" control is shown

#### Scenario: Supported LiDAR device auto-selects LiDAR
- **GIVEN** the user opens capture on an iOS device with LiDAR
- **WHEN** LiDAR produces a confidence ≥ 0.6 reading
- **THEN** the app stores a calibration reading with source "lidar"
- **AND** the user can capture without placing an ArUco marker in frame

#### Scenario: Non-LiDAR device auto-selects ArUco
- **GIVEN** the user opens capture on a device without LiDAR
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

### Requirement: ArUco lock is temporally smoothed and hysteretic
The ArUco calibrator SHALL emit a `pxPerMm` derived from a rolling-window median of recent frames, and SHALL use separate confidence thresholds for entering vs maintaining the locked state.

#### Scenario: Single-frame outlier does not perturb the published reading
- **GIVEN** the ArUco calibrator has accepted four consecutive valid samples around 24.5 px/mm
- **WHEN** a single noisy fifth sample arrives at 31.2 px/mm (motion blur / corner ambiguity)
- **THEN** the published reading is the median of the rolling window, not the outlier
- **AND** the calibration pill remains stable

#### Scenario: Marker dipping below the lock threshold keeps the lock
- **GIVEN** the calibrator is currently locked
- **WHEN** a frame's confidence falls between the hold threshold (0.45) and the lock threshold (0.6)
- **THEN** the lock is retained
- **AND** the smoothed value continues to update from the new sample

#### Scenario: Marker leaving the frame retains the lock for a brief grace period
- **GIVEN** the calibrator is currently locked
- **WHEN** the marker is occluded or leaves the frame for less than 1.5 seconds
- **THEN** the calibration pill continues to show the locked reading
- **AND** if the marker returns within the grace window the lock continues without flicker

#### Scenario: Sustained loss releases the lock cleanly
- **GIVEN** the calibrator is currently locked
- **WHEN** no valid sample arrives for longer than the grace window
- **THEN** the calibrator releases its lock and clears its rolling window
- **AND** the next valid sample must clear the full lock threshold before relocking

### Requirement: Multi-marker ArUco averaging
When multiple ArUco markers are visible in the same frame, the native detector SHALL compute `pxPerMm` for each marker independently and surface a `multiMedianPxPerMm` field alongside the legacy single-marker tuple. The JS calibrator SHALL prefer the median value when `markerCount > 1`.

#### Scenario: Two markers in frame yield a tighter median estimate
- **GIVEN** the inspector places two 5 cm ArUco cards in view, each derived as 24.6 and 24.9 px/mm respectively
- **WHEN** the native detector processes a frame
- **THEN** it returns `markerCount = 2` and `multiMedianPxPerMm ≈ 24.75`
- **AND** `useLiveArucoCalibration` publishes the median value rather than the largest-marker pxPerMm

#### Scenario: Multi-marker confidence is boosted
- **GIVEN** N markers are detected in a frame with single-marker confidence 0.7
- **WHEN** N ≥ 2
- **THEN** the published confidence is `min(1.0, 0.7 + 0.05 * (N - 1))`
- **AND** confidence does not exceed 1.0 regardless of marker count

#### Scenario: Single-marker frames keep legacy behaviour
- **GIVEN** only one marker is visible
- **WHEN** the detector returns `markerCount = 1`
- **THEN** `multiMedianPxPerMm` equals the single-marker `pxPerMm`
- **AND** the published reading and confidence match the pre-multi-marker behaviour

#### Scenario: Native upgrade is wire-compatible with older JS bundles
- **GIVEN** an older JS bundle that destructures the first 6 elements of the native frame-processor return tuple
- **WHEN** the new native build emits an 8-tuple `[pxPerMm, markerId, confidence, observedAtMs, markerSizeMm, pixelWidth, markerCount, multiMedianPxPerMm]`
- **THEN** the old JS bundle ignores indices 6 and 7 and continues to operate on single-marker semantics

# Spec — live-camera-capture

## ADDED Requirements

### Requirement: Live camera viewfinder
The mobile app SHALL render a fullscreen live camera preview during the capture flow using `react-native-vision-camera` with the back camera as default.

#### Scenario: Viewfinder renders camera feed
- **GIVEN** camera permission is granted
- **WHEN** the user opens the scan screen
- **THEN** a fullscreen live camera preview renders within 500 ms
- **AND** safe-area insets are respected (Dynamic Island, notch, home indicator)

#### Scenario: Viewfinder shows guidance when permission missing
- **GIVEN** camera permission is denied
- **WHEN** the user opens the scan screen
- **THEN** an empty-state with "Camera permission required" + a button to open OS Settings is shown instead of the preview

### Requirement: Live mode capture
The mobile app SHALL provide a "Live" capture mode that runs YOLOv11n inference on each frame at ≥ 5 fps and renders detection rings over the preview in real time.

#### Scenario: Live detections animate over the preview
- **GIVEN** the user has selected variety + batch and is in live mode
- **WHEN** they hold the camera over a tray of seeds
- **THEN** colored rings appear around each detected seed within 200 ms of the seed entering the frame
- **AND** the KPI strip updates "Count / Avg mm / Grade A%" continuously

#### Scenario: Live shutter persists the latest frame
- **WHEN** the user taps the shutter in live mode
- **THEN** the most recent frame's detections are frozen
- **AND** the captured frame is uploaded to `inspection-images/<uuid>.jpg`
- **AND** an inspection row is created with `total_seeds`, `mean_length_mm`, `mean_width_mm`, `mean_area_mm2` from the frozen frame
- **AND** the user navigates to the review screen

### Requirement: Precise mode capture
The mobile app SHALL provide a "Precise" capture mode that requires a stable calibration lock before allowing shutter activation.

#### Scenario: Precise mode blocks shutter without lock
- **GIVEN** the user is in precise mode and no calibration is locked yet
- **WHEN** they tap the shutter
- **THEN** the shutter does not fire
- **AND** the calibration pill displays "Hold steady" with the current distance reading

#### Scenario: Precise mode fires on lock
- **GIVEN** LiDAR or ArUco calibration has reached confidence ≥ 0.8 for 1 continuous second
- **WHEN** the user taps the shutter
- **THEN** a high-resolution photo is taken via `takePhoto`
- **AND** YOLOv11n single-shot inference runs on the captured photo
- **AND** the calibration value at lock time is stored on the inspection row

### Requirement: Captured photo upload before result navigation
The mobile app SHALL upload the captured photo to Supabase Storage before navigating to the review screen.

#### Scenario: Upload succeeds
- **WHEN** the user captures a frame in either mode
- **THEN** the file is uploaded to the `inspection-images` bucket
- **AND** the public URL is recorded on the inspection row's `image_url`
- **AND** the upload progress is shown during the processing screen

#### Scenario: Upload fails — user can retry or discard
- **WHEN** the upload fails (no network, server error)
- **THEN** the processing screen shows an error state with "Retry" and "Discard" actions
- **AND** the captured local frame is not lost — Retry uses the same local file

### Requirement: Frame processor performance
The frame processor that drives live detection SHALL not block the UI thread; visible UI must remain at ≥ 50 fps even when inference is running.

#### Scenario: UI stays responsive during live inference
- **GIVEN** live mode is running with continuous detections
- **WHEN** the user scrolls or interacts with overlay elements
- **THEN** the UI animates smoothly without dropped frames in the visible layer
- **AND** the inference loop runs on a separate worklet thread

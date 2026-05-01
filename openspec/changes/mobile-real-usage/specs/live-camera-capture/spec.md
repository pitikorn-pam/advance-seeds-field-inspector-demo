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

#### Scenario: Camera route releases native resources on exit and re-entry
- **GIVEN** the user captures or records media, completes analysis, and lands on the Inspection Result page
- **WHEN** they tap Back to return to Live or Precise capture, or leave camera for another menu and reopen capture
- **THEN** the native camera view has been remounted cleanly
- **AND** shutter and record controls are enabled for a new capture attempt
- **AND** the app does not show a native view reparenting error or camera-session closed error

### Requirement: Flexible ROI (region of interest) for live counting
The mobile app SHALL allow the user to draw an ROI on the live preview using rectangle, polygon, or circle shapes. When an ROI is active, only detections whose centroid lies inside the shape contribute to the KPI strip and to the saved inspection's `total_seeds` / mean measurements.

#### Scenario: Default behavior when no ROI is drawn
- **GIVEN** no ROI has been drawn in the current session
- **WHEN** live mode runs
- **THEN** every detection in the frame contributes to the KPI strip
- **AND** the captured inspection on shutter includes all detected seeds

#### Scenario: Rectangle ROI
- **WHEN** the user picks the rectangle tool and drags two corners
- **THEN** a rectangle overlay appears with draggable handles at each corner
- **AND** the KPI strip recomputes to count only detections whose centroid falls inside the rectangle
- **AND** after the rectangle is committed, dragging a corner handle updates the existing rectangle without clearing the ROI

#### Scenario: Polygon ROI
- **WHEN** the user picks the polygon tool, taps to add vertices, then taps Close to close the shape
- **THEN** the polygon overlay closes and is rendered with draggable vertex handles
- **AND** point-in-polygon test gates the KPI counter
- **AND** after the polygon is committed, dragging a vertex handle updates that vertex while preserving a valid closed polygon
- **AND** tapping an edge midpoint adds a new vertex on that edge
- **AND** selecting a vertex exposes a delete action when the polygon would still have at least 3 vertices

#### Scenario: Circle ROI
- **WHEN** the user picks the circle tool, taps a center point, and drags outward to set the radius
- **THEN** a circle overlay renders with a center handle (move) and an edge handle (resize)
- **AND** point-in-circle test gates the KPI counter
- **AND** after the circle is committed, dragging the center moves the circle and dragging the edge handle resizes its radius

#### Scenario: ROI persists per-session, clears on capture
- **GIVEN** a user has drawn a polygon ROI
- **WHEN** they tap shutter and save the inspection, then start a new live session
- **THEN** the ROI is cleared (each session starts ROI-free)

#### Scenario: ROI persists in saved inspection metadata
- **GIVEN** an active ROI is in use when shutter fires
- **WHEN** the inspection is saved
- **THEN** the ROI shape (type + normalized coordinates) is stored in `inspections.metadata.roi` for traceability
- **AND** the result/detail/share media render the same ROI geometry when the media type supports overlays

### Requirement: Live inference crops to the active ROI when one is set
The mobile app SHALL crop camera frames to the active ROI's square-padded bounding box before resizing for the detector input, instead of always center-cropping the full frame.

#### Scenario: ROI crop concentrates pixels inside the region
- **GIVEN** the user has drawn a small rectangle ROI in one corner of the preview
- **WHEN** the live inference worklet processes a frame
- **THEN** the resize plugin is configured with `crop = ROI bbox padded to a square` and `scale = YOLO_INPUT_SIZE`
- **AND** the inverse-letterbox math used to map detections back to original-frame pixel coordinates uses the same crop rect
- **AND** the resulting detections still draw on the camera preview at the correct world positions

#### Scenario: No ROI falls back to centered square crop
- **GIVEN** no ROI has been drawn for the current session
- **WHEN** the live inference worklet processes a frame
- **THEN** the resize plugin uses a centered `min(frame.width, frame.height)` square crop
- **AND** behaviour matches pre-ROI versions of the app

#### Scenario: ROI close to a frame edge does not get squeezed
- **GIVEN** the user draws an ROI within a few pixels of the frame edge
- **WHEN** the worklet computes the square-padded crop
- **THEN** the square is shifted inward to stay inside the frame rather than shrunk

### Requirement: Live detection overlay interpolates between inference frames
The detection overlay SHALL animate bounding-box transitions between successive inference outputs so the overlay feels smooth at the device refresh rate even when inference itself runs at 15–30 Hz.

#### Scenario: Slow-moving object appears to track at 60 fps
- **GIVEN** a banana sits in frame and is detected on every inference cycle
- **WHEN** the camera is panned slowly so the banana moves a small amount per inference
- **THEN** the bounding box visibly interpolates its position between detection frames using a layout transition
- **AND** the user perceives smooth motion rather than 15 Hz snapping

#### Scenario: Object entering / leaving frame fades
- **WHEN** an object first becomes detected
- **THEN** the corresponding bounding box fades in over ~120 ms
- **WHEN** an object stops being detected
- **THEN** the bounding box fades out over ~160 ms
- **AND** the fades do not stall the JS thread or the camera preview

### Requirement: Native camera delivery load is constrained for frame processors
The Camera component SHALL constrain its native delivery rate via Vision Camera's `format` + `fps` props so the underlying `ImageAnalysis` buffer pool does not overflow on devices that default to high-rate capture.

#### Scenario: Android camera is configured for FHD high-refresh preview
- **GIVEN** the live capture screen mounts on a device whose default capture rate is 60 fps (e.g. Z Flip 7 FE)
- **WHEN** the `<Camera>` component is rendered
- **THEN** `useCameraFormat` selects a 1920x1080-or-smaller format while preferring 60 fps
- **AND** the `<Camera>` is given `format` plus an Android `fps` value clamped to the selected format's supported `minFps...maxFps` range
- **AND** devices with FHD/60 support receive a bounded FHD/60 preview stream while devices whose selected FHD format tops out at 30 receive FHD/30 instead of a `format/invalid-fps` error
- **AND** live YOLO inference is throttled separately by the hyperparameter `targetFps`

#### Scenario: Android disables ImageCapture while live detection owns the stream
- **GIVEN** Android live YOLO detection is active
- **WHEN** the `<Camera>` component is rendered
- **THEN** the app passes `photo={false}` so CameraX does not maintain an extra ImageCapture surface during sustained analysis
- **WHEN** the user taps shutter
- **THEN** live detection is detached, `photo` is re-enabled, and the app waits briefly before calling `takePhoto`

#### Scenario: iOS camera keeps the high-quality Core ML stream
- **GIVEN** the live capture screen mounts on iOS
- **WHEN** the `<Camera>` component is rendered
- **THEN** `useCameraFormat` selects a 1920x1080-or-smaller format that supports 30 fps
- **AND** the `<Camera>` is given `format` + `fps={30}` on iOS

#### Scenario: ImageAnalysis pool does not overflow during sustained detection
- **GIVEN** the live detection worklet is running and seeds are visible in frame
- **WHEN** detection runs for at least ten seconds
- **THEN** the Camera2 `ImageAnalysis` stage does not log
  `IllegalStateException: maxImages (6) has already been acquired, call #close before acquiring more`
- **AND** the camera preview remains responsive without "stuck" intervals

### Requirement: Android live inference limits JS-bound frame payload cost
Android live TFLite inference SHALL keep the worklet-to-JS frame payload small
enough that the frame processor releases CameraX `ImageProxy` buffers promptly
under sustained detections.

#### Scenario: Android resize output crosses to JS as uint8 pixels
- **GIVEN** Android live detections are enabled
- **WHEN** the frame processor resizes a camera frame to YOLO input size
- **THEN** it requests `dataType: "uint8"` from `vision-camera-resize-plugin`
- **AND** the JS inference callback copies those bytes into the reusable
  `Float32Array` tensor while normalizing values to `[0..1]`
- **AND** the payload crossing the worklet boundary for 640x640 RGB is about
  1.2 MB rather than about 4.9 MB

#### Scenario: Legacy hyperparams migrate to safer Android live defaults
- **GIVEN** a device has hyperparams persisted from the v1 store where live
  `targetFps` defaulted to 30
- **WHEN** hyperparams hydrate after upgrade
- **THEN** the app writes the v2 store
- **AND** missing or 30+ legacy `targetFps` values migrate to 15
- **AND** explicit lower tuning values such as 5, 10, or 15 are preserved

### Requirement: Android TFLite avoids camera-pipeline delegate contention
Android TFLite inference SHALL default to the CPU delegate while the live camera
pipeline is active so ML inference does not compete with the camera HAL's NPU
or GPU workloads.

#### Scenario: Android TFLite loads on CPU
- **GIVEN** the app loads the shared Android TFLite model
- **WHEN** the model is initialized
- **THEN** it is loaded without NNAPI or Android GPU delegates
- **AND** analyzer logs report `tflite delegate=cpu`
- **AND** inference histogram samples are recorded under `tflite-cpu`

### Requirement: Android live YOLO runs inside a native frame-processor plugin
Android live YOLO inference SHALL run in a Vision Camera native frame-processor
plugin so camera pixels do not cross from CameraX into JS for every live frame.

#### Scenario: Android live detector keeps pixels native
- **GIVEN** Android live detections are enabled
- **WHEN** the frame processor receives a YUV camera frame
- **THEN** the native plugin crops the active square ROI from the `ImageProxy`
- **AND** it samples/resizes directly into the 640x640 RGB TFLite input tensor
- **AND** it runs the bundled `yolo11n-seeds.tflite` model in native code
- **AND** only the model output tensor values and shape are returned to JS
- **AND** no `vision-camera-resize-plugin` pixel buffer is copied across the
  worklet-to-JS boundary for the live Android path

#### Scenario: Android native live detector uses stable CPU fallback first
- **GIVEN** the native Android live detector loads the bundled TFLite model
- **WHEN** inference starts on the Z Flip 7 FE class of hardware
- **THEN** the native interpreter uses the CPU/XNNPACK path by default
- **AND** logs include the native plugin timing and `delegate=cpu`
- **AND** hardware delegate promotion remains an explicit future tuning step
  after the native pipeline proves stable at FHD/30 preview delivery

#### Scenario: Android native live detector avoids per-frame pixel allocation
- **GIVEN** Android live detections are enabled
- **WHEN** the native plugin samples the active crop into the TFLite input
- **THEN** it reuses preallocated input/output buffers
- **AND** it reuses crop coordinate maps while the frame size and crop are unchanged
- **AND** it writes RGB values directly into the input tensor without allocating
  per-pixel arrays

#### Scenario: Android live default increases after native migration
- **GIVEN** a device has hyperparams persisted from the v2 store where live
  `targetFps` defaulted to 15
- **WHEN** hyperparams hydrate after the native Android migration
- **THEN** the app writes the v3 store
- **AND** missing or old-default `targetFps` values of 15 or higher migrate to
  the new 30 fps live inference target
- **AND** explicit lower tuning values such as 5 or 10 are preserved

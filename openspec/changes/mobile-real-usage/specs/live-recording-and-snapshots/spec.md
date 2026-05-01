# Spec — live-recording-and-snapshots

## ADDED Requirements

### Requirement: Video recording during live mode
The mobile app SHALL allow the user to record a video during live mode and persist it to Supabase Storage as an MP4 (or platform-equivalent). Recording is independent of the inspection capture flow — it does not produce an `inspections` row.

#### Scenario: Long-press shutter starts and stops video
- **GIVEN** the user is in live mode with the camera previewing
- **WHEN** they long-press (≥ 600 ms) the shutter button
- **THEN** the shutter ring animates into a recording indicator and a timer appears
- **AND** when they release the long-press, recording stops and the file is uploaded
- **AND** an entry is created in a new `recordings` table with `inspector_id`, `image_url` (the video URL), `duration_ms`, and a captured_at timestamp

#### Scenario: Dedicated record button alternative
- **WHEN** the user taps the dedicated record button (separate from the shutter) instead of long-pressing
- **THEN** recording starts on the first tap and stops on the second tap
- **AND** the result is identical to the long-press flow

#### Scenario: Recording survives app backgrounding briefly
- **GIVEN** a recording is in progress
- **WHEN** the user backgrounds the app for ≤ 2 seconds and returns
- **THEN** recording continues without interruption
- **AND** if the app is backgrounded longer than 2 seconds, the recording is stopped and saved

### Requirement: In-session snapshots without ending live mode
The mobile app SHALL allow the user to save snapshots of the current camera frame to the device's Photos library while remaining in live mode.

#### Scenario: Tapping the snapshot button saves a frame
- **GIVEN** the user is in live mode
- **WHEN** they tap the snapshot button (separate from shutter and record)
- **THEN** the most recent frame is saved to the device Photos library at full resolution
- **AND** a brief toast "Snapshot saved" appears
- **AND** the live preview continues uninterrupted

#### Scenario: Snapshots do NOT create an inspection
- **GIVEN** the user has taken 3 snapshots during a live session
- **WHEN** they later check the inspections list
- **THEN** no new inspection rows exist from those snapshots
- **AND** the snapshots are only on the device Photos library

#### Scenario: Snapshot requires Photos library permission
- **GIVEN** the user has not granted Photos library write permission
- **WHEN** they tap the snapshot button for the first time
- **THEN** the OS permission prompt appears
- **AND** if granted, the snapshot saves; if denied, an inline error explains how to enable it in Settings

### Requirement: Storage and retention policy for videos
Recorded videos SHALL be stored in a separate `recordings` Supabase Storage bucket (NOT `inspection-images`) with a different RLS policy because recordings can be much larger and lack the per-row provenance of inspections.

#### Scenario: Recordings bucket exists with separate RLS
- **WHEN** a maintainer applies the migration
- **THEN** a `recordings` bucket exists (public read, authenticated write, owner-delete)
- **AND** the `recordings` table is RLS-gated like `inspections`: inspectors see their own; admins see all but cannot delete others'

#### Scenario: Storage size guard
- **GIVEN** a recording's local file exceeds 100 MB
- **WHEN** the user releases the long-press
- **THEN** an alert appears: "Recording too large to upload. Save locally?" with options "Save to Photos" / "Discard"
- **AND** the cloud upload is skipped to avoid runaway Supabase storage costs

### Requirement: Video captures produce a real seed analysis result
A capture saved as a video recording SHALL produce the same shape of `AnalysisResult` as a photo capture — not an empty placeholder — so the Inspection Result page shows the same seed list, KPI strip, and per-seed drill-down regardless of media kind.

#### Scenario: Video capture extracts a midpoint thumbnail and runs the single-shot analyzer
- **GIVEN** the user finishes a 12-second recording with seeds visible throughout
- **WHEN** the processing screen runs analysis
- **THEN** it extracts a still image from the video at duration / 2 (midpoint)
- **AND** runs the same `analyzer.analyze` call that a photo capture would use
- **AND** the resulting `AnalysisResult.summary.total_seeds > 0` whenever the midpoint frame contains seeds the model can detect

#### Scenario: ArUco calibration is re-applied to the video thumbnail
- **GIVEN** a 5 cm ArUco marker is visible in the recording's midpoint frame
- **WHEN** processing runs ArUco detection on the extracted thumbnail
- **THEN** it derives `pxPerMm` from the marker
- **AND** overrides any session-level manual fallback so the saved inspection's `length_mm` / `width_mm` use the marker-derived calibration

#### Scenario: Thumbnail extraction failure falls back gracefully
- **GIVEN** `expo-video-thumbnails` cannot decode the recording (corrupted MP4 / codec mismatch)
- **WHEN** thumbnail extraction throws
- **THEN** the processing screen surfaces an empty `AnalysisResult` with `analyzerId: "skip-video"` so the Review page still mounts with the recording metadata + media
- **AND** the user is not stuck on the processing spinner

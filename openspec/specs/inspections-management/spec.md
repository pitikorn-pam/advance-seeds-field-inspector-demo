# inspections-management Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: Create inspection (mobile capture flow)
The mobile app SHALL allow an inspector to create a new inspection by selecting variety, batch, and capture mode, capturing or picking an image, and persisting the resulting analysis.

#### Scenario: Happy-path capture
- **GIVEN** Jane is on the Home screen
- **WHEN** she taps "+ New inspection", chooses variety "Rice — Hom Mali", batch "BATCH-2026-04", capture mode "Single", and proceeds through the camera shutter
- **THEN** a 2-second analysis indicator is shown
- **AND** an inspection row is created in Supabase with her `inspector_id`, image URL in storage, and 8–24 child seeds rows
- **AND** she lands on the Inspection Detail screen for the new row

#### Scenario: Cancel during capture discards nothing
- **WHEN** she backs out before the shutter
- **THEN** no inspection row is created

### Requirement: Mocked analysis via SeedAnalyzer adapter
The mobile app SHALL produce inspection results through a `SeedAnalyzer` interface, with `MockSeedAnalyzer` returning one of two pre-baked `AnalysisResult` payloads after a 2 ± 0.3 second delay.

#### Scenario: Analyzer returns a deterministic shape
- **WHEN** the analyzer is invoked with any image
- **THEN** the result includes `total_seeds`, `mean_length_mm`, `mean_width_mm`, `mean_area_mm2`, and an array of per-seed measurements
- **AND** the result conforms to the `AnalysisResult` type

#### Scenario: Mock warns on startup in dev
- **GIVEN** the app is running in dev mode
- **WHEN** the analyzer provider initializes
- **THEN** a console warning "MockSeedAnalyzer active — replace before production" is logged exactly once

### Requirement: List inspections with filters
Both apps SHALL provide an inspections list with filters by variety, batch, date range, and (admin only) inspector, plus a search field.

#### Scenario: Inspector sees only own inspections
- **GIVEN** Jane is signed in
- **WHEN** she opens the Inspections list
- **THEN** every row's `inspector_id` equals her id

#### Scenario: Admin filters by inspector
- **GIVEN** Alex is signed in
- **WHEN** he selects "Inspector: Jane" from the filter
- **THEN** only Jane's inspections are listed

### Requirement: Inspection detail and per-seed view
Both apps SHALL show an inspection detail screen with a per-seed grid of thumbnails, summary measurements, and a tap-through to a per-seed detail view.

#### Scenario: Per-seed thumbnail tap opens detail
- **WHEN** the user taps any seed thumbnail
- **THEN** the per-seed detail view opens showing length, width, area, grade, and defects

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


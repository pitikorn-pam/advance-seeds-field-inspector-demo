# reference-data-management Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: Varieties CRUD (admin only)
Both apps SHALL allow admins to create, read, update, and delete `varieties`. Inspectors SHALL only read.

#### Scenario: Admin creates a variety
- **GIVEN** Alex is signed in
- **WHEN** he submits the new-variety form with name "Rice — Riceberry", scientific name, description, and image URL
- **THEN** a new row appears in `varieties` and in the list
- **AND** the row's `created_by` equals Alex's id

#### Scenario: Inspector cannot create a variety
- **GIVEN** Jane is signed in
- **WHEN** she opens the Varieties screen
- **THEN** the "+ New variety" button is not rendered
- **AND** a direct API insert attempt is denied by RLS

#### Scenario: Admin edits a variety
- **WHEN** Alex edits the description and saves
- **THEN** the row's `description` is updated and reflected in the list

#### Scenario: Admin deletes an unused variety
- **WHEN** Alex deletes a variety with no associated inspections
- **THEN** the row is removed

### Requirement: Batches CRUD (admin only)
Both apps SHALL allow admins to create, read, update, and delete `batches`. Inspectors SHALL only read.

#### Scenario: Admin creates a batch
- **WHEN** Alex submits the new-batch form with code "BATCH-2026-05", location, sown date, and notes
- **THEN** a new row appears in `batches`

#### Scenario: Inspector reads batches in inspection setup
- **GIVEN** Jane is starting a new inspection
- **WHEN** the batch dropdown loads
- **THEN** every existing batch is selectable

### Requirement: Calibration profiles read-only
Both apps SHALL display the configured calibration profiles (px/mm value and source LiDAR/ArUco). The demo SHALL NOT expose CRUD actions for these.

#### Scenario: Calibration view shows honest values
- **GIVEN** any user is signed in
- **WHEN** they open the Calibration view
- **THEN** they see each profile's name, `px_per_mm` value, and source label
- **AND** no edit / delete controls are shown

### Requirement: User profiles read-only
Both apps SHALL provide a read-only Profile section in Settings showing the signed-in user's full name, email, role, and locale.

#### Scenario: Profile renders signed-in user
- **WHEN** the user opens Settings
- **THEN** the profile card displays the row from `profiles` matching `auth.uid()`


# reference-data-management Specification

## Purpose
Manage varieties, batches, calibration profiles, and user profiles as reference data for inspections.

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

### Requirement: Variety detail screen
The mobile app SHALL provide a `/varieties/[id]` route showing a single variety's hero image, scientific name, description, and a list of recent inspections of that variety scoped by RLS.

#### Scenario: Tapping a variety opens its detail
- **GIVEN** Jane is on the varieties list
- **WHEN** she taps "Rice — Hom Mali"
- **THEN** the variety detail screen renders with the variety's image, scientific name (italic), description, and a section "Recent inspections" listing her 2 Hom Mali inspections (Alex would see all)

#### Scenario: Variety with no recent inspections shows an empty hint
- **GIVEN** a variety has zero inspections matching the user's RLS scope
- **WHEN** the detail screen loads
- **THEN** the recent inspections section shows "No inspections yet" with a "+ New inspection" CTA pre-filled to that variety

### Requirement: Standalone profile screen
The mobile app SHALL provide a `/profile` route as a standalone screen mirroring the prototype's design, accessible from the Settings screen's "Profile" row and showing read-only `full_name`, `email`, `role`, and `locale` fields.

#### Scenario: Settings → Profile navigates
- **GIVEN** Jane is on Settings
- **WHEN** she taps the Profile row
- **THEN** the `/profile` screen opens with her data
- **AND** the back button returns her to Settings

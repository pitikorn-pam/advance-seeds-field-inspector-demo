# Spec — reference-data-management (delta)

## ADDED Requirements

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

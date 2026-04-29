# Spec — inspections-management (delta)

## MODIFIED Requirements

### Requirement: Create inspection (mobile capture flow)
The mobile app SHALL allow an inspector to create a new inspection via a three-step flow: Setup (variety + batch + notes + location toggle), Mode (Live vs Precise), then the chosen capture screen.

#### Scenario: Happy-path capture (3-step flow)
- **GIVEN** Jane is on the Home screen
- **WHEN** she taps "+ New inspection", lands on /capture/setup, picks variety "Rice — Hom Mali" via the Library selector, fills batch "BATCH-2026-04", taps Continue, lands on /capture/mode, picks "Live scan", lands on /capture/scan, presses the shutter, the analyzer returns, and she taps Save and sync on /capture/review
- **THEN** an inspection row is created in Supabase with her `inspector_id`, image URL in storage, and 8–24 child seeds rows
- **AND** she lands on the Inspection Detail screen for the new row

#### Scenario: Cancel during setup discards nothing
- **GIVEN** Jane is on /capture/setup
- **WHEN** she taps the close button before tapping Continue
- **THEN** no inspection row is created
- **AND** the capture session is reset to defaults

#### Scenario: Cancel during mode pick discards nothing
- **GIVEN** Jane is on /capture/mode
- **WHEN** she taps Back
- **THEN** she returns to /capture/setup with her existing setup values preserved
- **AND** no inspection row is created

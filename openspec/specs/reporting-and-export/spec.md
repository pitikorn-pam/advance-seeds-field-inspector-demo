# reporting-and-export Specification

## Purpose
Define mobile reporting, filtering, and CSV sharing for inspection summaries.
## Requirements
### Requirement: Reports screen with filters
The mobile app SHALL provide a Reports screen showing aggregated statistics filtered by date range, variety, and (admin only) inspector.

#### Scenario: Default report shows last 30 days
- **GIVEN** the user opens Reports
- **WHEN** no filter is applied
- **THEN** the screen shows totals for the last 30 days: number of inspections, total seeds analyzed, mean length / width / area

#### Scenario: Filter by variety updates totals
- **WHEN** the user selects variety "Rice — Hom Mali" from the filter
- **THEN** all displayed metrics recompute to that variety only

### Requirement: CSV export
The mobile app SHALL allow exporting the currently filtered inspections list as a CSV file.

#### Scenario: Mobile CSV share
- **WHEN** Alex taps "Export CSV" on the Reports screen with current filters
- **THEN** the OS share sheet opens with an `inspections-YYYYMMDD.csv` attachment
- **AND** the file's first row is a header in this exact column order:
  `id, captured_at, inspector_email, inspector_name, variety, calibration_source, calibration_px_per_mm, total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2, notes, created_at`

#### Scenario: CSV header follows current locale
- **GIVEN** the user has Thai selected as their locale
- **WHEN** they export CSV
- **THEN** the header row is rendered in Thai (column keys remain stable; only the human-readable header labels translate)
- **AND** inspectors receive only their own filtered inspections while admins receive the admin-scoped filtered set

### Requirement: Inspector-scoped reports
Reports for an inspector SHALL only aggregate the inspector's own inspections; admin reports SHALL aggregate across all users by default.

#### Scenario: Inspector totals match own data only
- **GIVEN** Jane has 5 inspections totaling 78 seeds, and Alex has 2 totaling 30 seeds
- **WHEN** Jane opens Reports with no filter
- **THEN** the total inspections count is 5 and total seeds is 78

# theming Specification

## Purpose
Ensure consistent light/dark mode theming via design tokens, with glass-on-camera surface tokens for camera UI.

## Requirements
### Requirement: Light and dark mode wired to tokens
Both apps SHALL render in light or dark mode using the colors defined in `docs/handoff/design-tokens.json` for each scheme. No additional palette shall be introduced.

#### Scenario: Dark mode swaps brand to light teal
- **GIVEN** the app is in dark mode
- **WHEN** any element using the `--as-brand` token renders
- **THEN** its computed color is `#5DCAA5` (the dark-mode brand value)

#### Scenario: Light mode uses deep teal
- **GIVEN** the app is in light mode
- **WHEN** any element using the `--as-brand` token renders
- **THEN** its computed color is `#0F6E56`

### Requirement: User toggle in Settings
Both apps SHALL provide a theme toggle (Light / Dark / System) in Settings. The chosen value SHALL persist.

#### Scenario: Toggle persists across reload
- **WHEN** the user picks "Dark" and reloads the app
- **THEN** the app launches in dark mode

#### Scenario: System mode follows OS
- **GIVEN** the app is set to "System"
- **WHEN** the OS appearance switches from light to dark
- **THEN** the app updates without a reload

### Requirement: Status colors not repurposed
The applications SHALL only use the success / warning / danger / info status colors for status meaning, never for decoration.

#### Scenario: Code review check
- **WHEN** a reviewer scans for `text-success` / `bg-danger` usage outside status pills, badges, or alerts
- **THEN** any decorative usage is flagged and corrected

### Requirement: Glass-on-camera surface tokens
The design system SHALL include glass-style surface tokens for UI rendered over a live camera preview (translucent black + white text), referenced by the camera viewfinder, top bar, calibration pill, and KPI strip.

#### Scenario: Glass tokens are defined in design-tokens.json
- **WHEN** an engineer opens `docs/handoff/design-tokens.json`
- **THEN** the file contains a `color.glass` block with at least: `surface` (rgba(0,0,0,0.6)), `border` (rgba(255,255,255,0.16)), `text` (#FFFFFF), `text-muted` (rgba(255,255,255,0.7))
- **AND** the token-package build emits Tailwind utilities `bg-glass`, `border-glass`, `text-glass`, `text-glass-muted`

#### Scenario: Camera UI uses tokens, not inline rgba
- **WHEN** a reviewer greps `apps/mobile/components/camera/**` for raw `rgba(` literals
- **THEN** none are found; every glass background and border references the new tokens

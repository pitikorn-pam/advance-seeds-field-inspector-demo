# Spec — theming

## ADDED Requirements

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

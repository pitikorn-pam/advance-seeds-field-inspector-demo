# Spec — theming (delta)

## ADDED Requirements

### Requirement: Glass-on-camera surface tokens
The design system SHALL include glass-style surface tokens for UI rendered over a live camera preview (translucent black + white text), referenced by the camera viewfinder, top bar, calibration pill, and KPI strip.

#### Scenario: Glass tokens are defined in design-tokens.json
- **WHEN** an engineer opens `docs/handoff/design-tokens.json`
- **THEN** the file contains a `color.glass` block with at least: `surface` (rgba(0,0,0,0.6)), `border` (rgba(255,255,255,0.16)), `text` (#FFFFFF), `text-muted` (rgba(255,255,255,0.7))
- **AND** the token-package build emits Tailwind utilities `bg-glass`, `border-glass`, `text-glass`, `text-glass-muted`

#### Scenario: Camera UI uses tokens, not inline rgba
- **WHEN** a reviewer greps `apps/mobile/components/camera/**` for raw `rgba(` literals
- **THEN** none are found; every glass background and border references the new tokens

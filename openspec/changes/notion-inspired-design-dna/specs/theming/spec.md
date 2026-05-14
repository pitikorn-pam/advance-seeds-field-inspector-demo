## MODIFIED Requirements

### Requirement: Light and dark mode wired to tokens
Both apps SHALL render in light or dark mode using the colors defined in `docs/handoff/design-tokens.json` for each scheme. The active design DNA SHALL be documented in root `DESIGN.md`, and generated token artifacts SHALL include primary purple, navy band, pastel card tint, and camera glass roles.

#### Scenario: Dark mode swaps primary to light purple
- **GIVEN** the app is in dark mode
- **WHEN** any element using the `--as-brand` or `--as-primary` token renders
- **THEN** its computed color is `#8F75FF`

#### Scenario: Light mode uses primary purple
- **GIVEN** the app is in light mode
- **WHEN** any element using the `--as-brand` or `--as-primary` token renders
- **THEN** its computed color is `#6C47FF`

### Requirement: Design DNA source of truth
The repository SHALL include root `DESIGN.md` as the human-readable design source while `docs/handoff/design-tokens.json` remains the machine-readable token source.

#### Scenario: Engineer finds design guidance
- **WHEN** an engineer opens the repository root
- **THEN** `DESIGN.md` describes the Advance Seeds design DNA, colors, typography, layout, components, camera rules, and content voice
- **AND** it references the token roles used by the generated token pipeline

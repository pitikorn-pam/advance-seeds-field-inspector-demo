# internationalization Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: English and Thai locales
The mobile app SHALL ship complete UI translations for English (`en`) and Thai (`th`) covering every visible string in the demo flows.

#### Scenario: Mobile toggle changes all visible text
- **GIVEN** the mobile Settings screen
- **WHEN** the user picks Thai
- **THEN** every screen on subsequent navigation renders in Thai

### Requirement: Default locale follows device
On first launch with no persisted preference, the mobile app SHALL default to the device locale if Thai or English; otherwise SHALL default to English.

#### Scenario: Thai phone gets Thai default
- **GIVEN** a fresh install on a phone whose locale is `th-TH`
- **WHEN** the user opens the app
- **THEN** the UI renders in Thai

#### Scenario: French phone falls back to English
- **GIVEN** a fresh install on a `fr-FR` phone
- **WHEN** the user opens the app
- **THEN** the UI renders in English

### Requirement: No raw English in components
The codebase SHALL keep all user-facing strings in i18n resource files; no raw English literal strings shall appear in JSX outside the i18n bundle.

#### Scenario: Lint blocks raw string
- **WHEN** a developer adds `<Text>Save</Text>` and runs `pnpm lint`
- **THEN** the lint check flags the file with a "use t()" violation


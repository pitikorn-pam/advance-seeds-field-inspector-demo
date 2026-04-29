# mobile-navigation Specification

## Purpose
TBD - created by archiving change prototype-fidelity-pass. Update Purpose after archive.
## Requirements
### Requirement: Bottom tab bar with four destinations
The mobile app SHALL render a bottom tab bar with exactly four destinations in this order: Home, Camera, Library, More. The Camera tab uses a camera icon; the More tab uses an overflow / horizontal-dots icon.

#### Scenario: Tab bar visible after sign-in
- **GIVEN** Jane is signed in and lands on /(tabs)
- **WHEN** any tab screen renders
- **THEN** the bottom bar shows four tabs in order: Home, Camera, Library, More
- **AND** the active tab's icon and label are tinted with the brand color

#### Scenario: Camera tab opens capture setup
- **WHEN** Jane taps the Camera tab from any other tab
- **THEN** she lands on /capture/setup
- **AND** the capture session is reset to defaults if it was empty, or preserved if she had values mid-flow

### Requirement: More menu groups secondary destinations
The /more screen SHALL render four sections — Manage, Reference, Insights, App — each with list rows that route to existing screens.

#### Scenario: More renders sectioned menu
- **WHEN** Jane taps the More tab
- **THEN** four sections render in order: Manage (Profile, Recordings, Sign out), Reference (Batches, Calibration), Insights (History, Reports), App (Settings, About)
- **AND** every row except Sign out has a chevron affordance

#### Scenario: More row routes correctly
- **WHEN** Jane taps any non-destructive row
- **THEN** the corresponding screen pushes onto the stack (router.push), not replaces
- **AND** the back gesture returns her to /more

#### Scenario: Sign out from More
- **WHEN** Jane taps the Sign out row
- **THEN** the auth session is cleared via supabase.signOut()
- **AND** she is routed to /login

### Requirement: Capture entry from Camera tab and Home CTA
The mobile app SHALL provide two entry points to the capture flow: the Camera tab in the bottom bar, and a primary CTA on the Home screen labeled "+ New inspection".

#### Scenario: Home CTA matches Camera tab destination
- **WHEN** Jane taps either the Home "+ New inspection" CTA or the Camera tab
- **THEN** she lands on /capture/setup with the same initial state

### Requirement: Three-step capture flow
The capture flow SHALL be three screens: setup (variety + batch + notes + location toggle), mode (Live vs Precise), then the chosen capture screen (scan or precise).

#### Scenario: Setup → Mode → Scan
- **GIVEN** Jane is on /capture/setup with all required fields filled
- **WHEN** she taps Continue
- **THEN** she lands on /capture/mode
- **WHEN** she taps Live scan
- **THEN** she lands on /capture/scan with mode=live on the session

#### Scenario: Setup → Mode → Precise
- **WHEN** Jane is on /capture/mode and taps Precise capture
- **THEN** she lands on /capture/precise with mode=precise on the session

#### Scenario: Setup blocks Continue without variety
- **GIVEN** Jane is on /capture/setup with no variety chosen
- **WHEN** she taps Continue
- **THEN** the button is disabled and she does not navigate

### Requirement: Variety selection via Library
The /capture/setup screen's variety selector SHALL open the Library in selection mode; choosing a variety dismisses Library back to /capture/setup with the choice persisted on the capture session.

#### Scenario: Variety selector opens Library
- **WHEN** Jane taps the variety field on /capture/setup
- **THEN** /(tabs)/library opens with `?select=variety` and shows the same family-segmented sections
- **WHEN** she taps a variety row
- **THEN** Library dismisses and /capture/setup shows the chosen variety in the selector with name and reference dimensions

### Requirement: Home dashboard composition
The Home screen SHALL show, in vertical order: a greeting line, a hero card with today's KPIs and a sparkline, a primary "+ New inspection" CTA, a Recent section with up to three inspections and a "View all" link, and a sync status banner.

#### Scenario: Home renders all sections
- **WHEN** Jane lands on Home with at least one inspection from today
- **THEN** the hero card shows total seeds, % Grade A, and batch count for today
- **AND** the recent list shows up to 3 most recent inspections with variety-tinted thumbs
- **AND** the sync banner reads "All inspections synced · Last sync {{relative}}"

#### Scenario: Home empty state
- **GIVEN** Jane has no inspections today
- **WHEN** she lands on Home
- **THEN** the hero card shows "Today: 0" with a yesterday recap underneath
- **AND** the recent list still renders the most recent prior inspections (not necessarily today's)
- **AND** the "+ New inspection" CTA is unchanged


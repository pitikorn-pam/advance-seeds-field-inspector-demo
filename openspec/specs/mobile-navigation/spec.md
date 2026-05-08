# mobile-navigation Specification

## Purpose
Define the bottom tab bar layout, capture entry points, unified capture journey, and list virtualization conventions for the mobile app.

## Requirements
### Requirement: Bottom tab bar with four destinations
The mobile app SHALL render a bottom tab bar with exactly four destinations in
this order: Home, Inspect, Varieties, More. The Inspect tab uses a camera icon;
the More tab uses an overflow / horizontal-dots icon.

#### Scenario: Four tabs render in order
- **GIVEN** Jane is signed in and lands on /(tabs)
- **WHEN** any tab screen renders
- **THEN** the bottom bar shows four tabs in order: Home, Inspect, Varieties,
  More
- **AND** the active tab's icon and label are tinted with the brand color

#### Scenario: Inspect tab opens capture setup without mounting an intermediate tab screen
- **WHEN** Jane taps the Inspect tab from any other tab
- **THEN** the tab press is intercepted before the `/inspect` tab screen mounts
- **AND** she lands on `/capture/setup`
- **AND** the app does not show a native view reparenting error during the
  transition

### Requirement: More menu groups secondary destinations
The /more screen SHALL render four sections — Manage, Reference, Insights, App — each with list rows that route to existing screens.

#### Scenario: More renders sectioned menu
- **WHEN** Jane taps the More tab
- **THEN** four sections render in order: Manage (Profile, Recordings, Sign out), Reference (Varieties, Calibration), Insights (History, Reports), App (Settings, About)
- **AND** every row except Sign out has a chevron affordance

#### Scenario: More row routes correctly
- **WHEN** Jane taps any non-destructive row
- **THEN** the corresponding screen pushes onto the stack (router.push), not replaces
- **AND** the back gesture returns her to /more

#### Scenario: Sign out from More
- **WHEN** Jane taps the Sign out row
- **THEN** the auth session is cleared via supabase.signOut()
- **AND** she is routed to /login

### Requirement: Capture entry from Inspect tab and Home CTA
The mobile app SHALL provide two entry points to the capture flow: the Inspect tab in the bottom bar, and a primary CTA on the Home screen labeled "+ New inspection".

#### Scenario: Home CTA matches Inspect tab destination
- **WHEN** Jane taps either the Home "+ New inspection" CTA or the Inspect tab
- **THEN** she lands on /capture/setup with the same initial state

### Requirement: Unified capture flow
The capture flow SHALL be two screens before processing: setup (variety + notes + location toggle), then the adaptive scan camera. The app SHALL NOT show a Live/Precise capture-mode picker.

#### Scenario: Setup → Scan
- **GIVEN** Jane is on /capture/setup with all required fields filled
- **WHEN** she taps Continue
- **THEN** she lands on /capture/scan with mode=live on the session

#### Scenario: Setup blocks Continue without variety
- **GIVEN** Jane is on /capture/setup with no variety chosen
- **WHEN** she taps Continue
- **THEN** the button is disabled and she does not navigate

### Requirement: Home dashboard composition
The Home screen SHALL show, in vertical order: a greeting line, a hero card with today's KPIs and a sparkline, a primary "+ New inspection" CTA, a Recent section with up to three inspections and a "View all" link, and a sync status banner.

#### Scenario: Home renders all sections
- **WHEN** Jane lands on Home with at least one inspection from today
- **THEN** the hero card shows runs, total seeds, average length, and last run for the selected date range
- **AND** the recent list shows up to 3 most recent inspections with variety-tinted thumbs
- **AND** the sync banner reads "All inspections synced · Last sync {{relative}}"

#### Scenario: Home empty state
- **GIVEN** Jane has no inspections today
- **WHEN** she lands on Home
- **THEN** the hero card shows "Today: 0" with a yesterday recap underneath
- **AND** the recent list still renders the most recent prior inspections (not necessarily today's)
- **AND** the "+ New inspection" CTA is unchanged

### Requirement: Long mobile lists remain virtualized
The mobile app SHALL render long-running library and activity lists with
virtualized list primitives so offscreen rows are mounted lazily instead of
eagerly mounted inside a `ScrollView`.

#### Scenario: Reference and activity lists lazy-mount rows
- **WHEN** Jane opens Recordings, History, or Varieties
- **THEN** the primary row collection uses a virtualized list
- **AND** filter/search controls render as list header content on the same
  scroll surface
- **AND** row rendering is batched with bounded initial and offscreen windows

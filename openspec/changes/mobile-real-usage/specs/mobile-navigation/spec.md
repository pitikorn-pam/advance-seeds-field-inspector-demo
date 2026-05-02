# Spec — mobile-navigation

## MODIFIED Requirements

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

#### Scenario: Capture prerequisites uses back navigation
- **GIVEN** Jane opens Capture prerequisites from the capture mode picker
- **WHEN** the screen renders
- **THEN** the top-left navigation action uses a back chevron
- **AND** tapping it returns to the previous capture screen

### Requirement: Long mobile lists remain virtualized
The mobile app SHALL render long-running library and activity lists with
virtualized list primitives so offscreen rows are mounted lazily instead of
eagerly mounted inside a `ScrollView`.

#### Scenario: Reference and activity lists lazy-mount rows
- **WHEN** Jane opens Recordings, History, Varieties, or Batches
- **THEN** the primary row collection uses a virtualized list
- **AND** filter/search controls render as list header content on the same
  scroll surface
- **AND** row rendering is batched with bounded initial and offscreen windows

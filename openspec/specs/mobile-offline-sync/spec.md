# mobile-offline-sync Specification

## Purpose
Persistent local sync queue for inspections and recordings that survives app reloads, replays automatically when connectivity returns, and surfaces pending/failed state across all relevant screens.

## Requirements
### Requirement: Local sync queue
The mobile app SHALL persist failed or offline inspection and recording mutations into a local sync queue that survives app reloads.

#### Scenario: Inspection save queues while offline
- **GIVEN** the device has no network connection
- **AND** the inspector has completed capture and analysis
- **WHEN** they tap Save
- **THEN** the inspection payload, seeds, metadata, and local media URI are written to the local sync queue
- **AND** the app shows the item as Pending instead of losing the capture

#### Scenario: Queue survives app reload
- **GIVEN** an inspection queue entry is pending
- **WHEN** the app reloads or is force-closed and reopened
- **THEN** the pending entry is still visible in History and Settings sync status

### Requirement: Replay pending queue entries
The mobile app SHALL replay pending queue entries automatically when the app is foregrounded and network/authentication are available.

#### Scenario: Pending inspection syncs after network returns
- **GIVEN** a pending inspection exists in the local queue
- **WHEN** the network becomes available and the user is signed in
- **THEN** the worker uploads the media, inserts the inspection row, inserts seed rows, and marks the queue entry Synced
- **AND** React Query inspection lists are invalidated so server data replaces the local pending row

#### Scenario: Partial upload does not duplicate media
- **GIVEN** media upload succeeded but DB insert failed
- **WHEN** replay runs again
- **THEN** the worker reuses the stored uploaded URL and retries only the remaining DB insert work

### Requirement: Visible sync states
The mobile app SHALL show sync state consistently across Home, History, Inspection Detail, Recordings, and Settings.

#### Scenario: Home banner shows pending count
- **GIVEN** two queue entries are pending
- **WHEN** the user opens Home
- **THEN** the sync banner shows a pending state and the count `2`

#### Scenario: History filters pending and failed rows
- **GIVEN** History contains synced server rows and local pending rows
- **WHEN** the user selects the Pending filter
- **THEN** only pending local rows are shown
- **AND** the existing date-range filter still applies

#### Scenario: Settings sync section exposes retry controls
- **GIVEN** one queue entry has failed
- **WHEN** the user opens Settings
- **THEN** the sync section shows failed count, last error summary, Retry all, and Clear failed actions

### Requirement: Recording uploads can queue
The mobile app SHALL queue recording uploads when the recording cannot be uploaded immediately.

#### Scenario: Recording upload queues offline
- **GIVEN** the user records a video while offline
- **WHEN** recording stops
- **THEN** the local video URI and recording metadata are queued
- **AND** Recordings shows the item as Pending upload

#### Scenario: Recording replay creates server row
- **GIVEN** a pending recording exists
- **WHEN** replay succeeds
- **THEN** the MP4 is uploaded to the `recordings` bucket
- **AND** a `recordings` row is inserted with duration, metadata, and captured timestamp
- **AND** the local pending row becomes synced

### Requirement: Queue failure handling
The mobile app SHALL preserve local media and expose retry/cancel controls when replay fails.

#### Scenario: Replay failure keeps media
- **WHEN** replay fails during upload or insert
- **THEN** the queue entry status becomes Failed
- **AND** local media remains available for retry
- **AND** the last error is stored for display

#### Scenario: Cancel pending entry removes local artifacts
- **GIVEN** a pending or failed queue entry exists
- **WHEN** the user chooses Cancel/Delete local draft
- **THEN** the queue entry is removed
- **AND** associated local media is deleted best-effort

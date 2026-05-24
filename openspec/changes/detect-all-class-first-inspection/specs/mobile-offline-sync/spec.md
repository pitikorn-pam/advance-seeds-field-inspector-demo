## MODIFIED Requirements

### Requirement: Local sync queue
The mobile app SHALL persist failed or offline inspection and recording mutations into a local sync queue that survives app reloads. Inspection queue payloads SHALL preserve detector filter metadata, class breakdown metadata, and per-seed detected class identity.

#### Scenario: Inspection save queues while offline
- **GIVEN** the device has no network connection
- **AND** the inspector has completed class-first capture and analysis
- **WHEN** they tap Save
- **THEN** the inspection payload, seeds, per-seed class id/name fields, metadata, and local media URI are written to the local sync queue
- **AND** the app shows the item as Pending instead of losing the capture

#### Scenario: Queue survives app reload
- **GIVEN** an inspection queue entry is pending
- **WHEN** the app reloads or is force-closed and reopened
- **THEN** the pending entry is still visible in History and Settings sync status
- **AND** its detector filter and per-seed class fields are still present in the queued payload

### Requirement: Replay pending queue entries
The mobile app SHALL replay pending queue entries automatically when the app is foregrounded and network/authentication are available.

#### Scenario: Pending inspection syncs after network returns
- **GIVEN** a pending class-first inspection exists in the local queue
- **WHEN** the network becomes available and the user is signed in
- **THEN** the worker uploads the media, inserts the inspection row, inserts seed rows including class id/name fields, and marks the queue entry Synced
- **AND** React Query inspection lists are invalidated so server data replaces the local pending row

#### Scenario: Partial upload does not duplicate media
- **GIVEN** media upload succeeded but DB insert failed
- **WHEN** replay runs again
- **THEN** the worker reuses the stored uploaded URL and retries only the remaining DB insert work
- **AND** the retried seed insert preserves the same class fields as the original queued payload

# Proposal — Mobile Offline Sync

## Why

Field inspectors can lose network coverage during capture, especially in farms, seed storage areas, or customer visits. Today the mobile app uploads media and inserts Supabase rows immediately; if the network fails, the user must retry in the active flow and risks losing momentum. The Home sync banner, History sync tag, and demo script already reserve space for offline-first behavior, but they are placeholders.

This change makes capture work resiliently offline: inspections and recordings are stored locally as queue entries, shown as pending in the app, and replayed when the device is online again.

## What Changes

- Add a local sync queue for mobile mutations and media uploads.
- Queue inspection saves, seed rows, recording rows, and storage uploads when network or Supabase is unavailable.
- Show sync state in Home, History, Inspection Detail, Recordings, and Settings.
- Add retry, cancel/delete, and error visibility for failed queue items.
- Preserve capture media locally until its queue item is synced or discarded.
- Keep server rows immutable after successful sync; conflict handling is last-write-never, because inspection rows are append-only.

## Capabilities

### New Capabilities

- `mobile-offline-sync`: local queue, replay worker, pending/failed/synced UI states, retry controls.

### Modified Capabilities

- `inspections-management`: save succeeds locally when offline and later syncs to Supabase.
- `live-recording-and-snapshots`: recordings can be queued for upload instead of failing the flow.
- `mobile-navigation`: Home sync banner and History filters show pending/failed/synced states.

## Impact

- **Code (mobile)**: new local queue store under `apps/mobile/lib/sync/`, queue-aware wrappers around inspection/recording creation, replay worker mounted at app root, sync status hooks for screens.
- **Storage**: local media files must remain available until replay; successful replay removes temporary local artifacts.
- **Database**: no new remote table is required for v1. Queue state is local-only. Existing Supabase `inspections`, `seeds`, `recordings`, and storage buckets remain source of truth after sync.
- **UX**: Save can complete offline, but rows clearly show Pending or Failed until replay succeeds.
- **Out of scope**: background sync while the app is fully terminated, cross-device conflict resolution, server-side queue auditing, and push notifications.

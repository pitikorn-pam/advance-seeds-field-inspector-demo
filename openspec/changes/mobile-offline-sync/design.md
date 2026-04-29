# Design — Mobile Offline Sync

## Context

The mobile app currently uses React Query mutations in `apps/mobile/lib/queries.ts` and uploads media directly from capture screens before saving server rows. The UI already has placeholders:

- `components/home/SyncBanner.tsx`
- `app/more/history.tsx` synced/pending visual branch
- Settings sync section

Offline sync must preserve the current capture journey while changing the persistence model from "server first" to "local first, server replay."

## Goals / Non-Goals

**Goals:**
- Saving an inspection or recording offline produces a visible local item immediately.
- Queued items replay automatically when network returns and manually when the user taps Retry.
- Pending/failed states are visible and filterable.
- Local media files are retained until upload succeeds.
- Duplicate replay is prevented with stable local IDs and idempotent queue state transitions.

**Non-Goals:**
- Background replay after the OS terminates the app.
- Cross-device merge/conflict resolution.
- Offline reference-data CRUD for varieties, batches, or calibration profiles.
- Server-side queue table.

## Queue Model

Queue entries live in AsyncStorage as JSON and reference media by local URI.

```ts
type SyncQueueStatus = "pending" | "syncing" | "failed" | "synced" | "cancelled";

interface SyncQueueEntry {
  id: string;
  kind: "inspection" | "recording";
  status: SyncQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  payload: InspectionQueuePayload | RecordingQueuePayload;
}
```

The `id` is generated client-side and remains stable across retries. Remote Supabase IDs are stored on the queue entry after successful insert so replay cannot duplicate rows after partial success.

## Persistence Flow

### Inspection

1. Capture stores media local URI and analysis result in session.
2. Save builds the same inspection payload currently passed to `useCreateInspection`.
3. If online upload + insert succeeds, mark synced and navigate to remote detail.
4. If upload/insert fails due to network or service error, write a pending/failed queue entry and navigate to a local pending detail surface.
5. Replay uploads media first, inserts `inspections`, inserts `seeds`, then marks synced.

### Recording

1. Stop recording retains local MP4.
2. Replay uploads to `recordings` bucket, inserts `recordings`, and updates any linked inspection metadata if needed.
3. Local file is deleted only after upload and row insert succeed.

## Replay Worker

`SyncQueueWorker` mounts once under the mobile root layout. It:

- starts on app foreground
- starts when connectivity changes to online
- processes one entry at a time
- uses exponential backoff after failures
- never retries cancelled entries
- invalidates React Query keys after successful replay

Connectivity is detected via `@react-native-community/netinfo`. If adding the package requires native config changes, run Expo prebuild and rebuild the dev client.

## UI States

- **Home SyncBanner**: Up to date, N pending, N failed.
- **History**: Synced/Pending/Failed filters are real, not placeholders.
- **Inspection Detail**: pending local inspections show a Pending sync pill and disabled server-only actions until synced.
- **Recordings**: pending/failed upload states shown per row.
- **Settings**: Sync section shows queue counts, last successful sync, Retry all, and Clear failed.

## Failure Handling

- Upload failure keeps local media and marks entry failed with last error.
- Insert failure after upload stores the uploaded public URL in the queue entry and retries only the remaining DB insert.
- Delete/cancel removes pending local queue entry and local media. Synced rows still use existing server delete paths.
- Auth missing pauses replay and shows "Sign in to sync."

## Testing

- Unit-test queue reducer/state transitions.
- Unit-test payload serialization for inspections and recordings.
- Manual device test with network disabled before Save.
- Manual replay test after network returns.
- Supabase DB query confirms synced rows and seed rows exist once replay completes.

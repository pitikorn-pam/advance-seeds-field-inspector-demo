# Tasks — Mobile Offline Sync

## 1. Queue foundation

- [ ] 1.1 Add `@react-native-community/netinfo` if needed for connectivity detection.
- [x] 1.2 Create `apps/mobile/lib/sync/types.ts` with queue entry, status, inspection payload, and recording payload types.
- [x] 1.3 Create `apps/mobile/lib/sync/store.ts` backed by AsyncStorage with list/add/update/remove helpers.
- [x] 1.4 Add unit tests for queue state transitions and JSON serialization. Pure transitions live in `apps/mobile/lib/sync/store.ts` (mirrored to `transitions.mjs`); 11 tests in `transitions.test.mjs` cover add / update / remove / clear-failed / retry-all (failed + stale syncing) / mark-failed (attempts + error extraction) plus a JSON roundtrip guard for AsyncStorage persistence.
- [x] 1.5 Add `useSyncQueue()` hook exposing counts, entries, retry, retry all, cancel, and clear failed.

## 2. Replay worker

- [x] 2.1 Create `apps/mobile/lib/sync/replay.ts` for inspection and recording replay.
- [x] 2.2 Replay inspection media upload, inspection insert, seed insert, and metadata update idempotently. After a successful media upload `replay.ts` now persists the resulting public URL onto the queue entry's payload via `updateQueueEntry({ payload: applyRemoteMediaUrl(...) })`, before attempting the DB insert. A subsequent retry sees `remote_media_url` populated and the `?? uploadMedia(...)` branch is skipped, so a partial DB failure doesn't orphan duplicate Storage objects on retry. `createInspectionRemote` already inserts the inspection + seeds in a single RPC, so its retry behavior remains a single all-or-nothing call.
- [x] 2.3 Replay recording upload and row insert idempotently. Same checkpoint pattern applied to the recording branch in `replayEntry`: upload → persist `remote_video_url` → `createRecordingRemote`.
- [x] 2.4 Preserve uploaded public URL on the queue entry when upload succeeds but DB insert fails. `applyRemoteMediaUrl` (pure helper in `lib/sync/payloadUpdates.{ts,mjs}`) writes the right field per payload kind; covered by 4 tests in `payloadUpdates.test.mjs`.
- [x] 2.5 Mount `SyncQueueWorker` once in the mobile root layout.
- [ ] 2.6 Trigger replay on app foreground, connectivity restored, sign-in restored, and Retry all.

## 3. Capture integration

- [x] 3.1 Refactor inspection save payload assembly out of `capture/review.tsx` into a reusable queue-safe helper. New `apps/mobile/lib/inspections/savePayload.ts` exposes `buildInspectionSavePayload` (returns the row shape `useCreateInspection` accepts) + `toInspectionQueuePayload` (wraps it for `addQueueEntry`) + `isLocalUri`. Both happy-path and queueable-error paths now share the same assembly, and the `.mjs` mirror is covered by 8 tests in `savePayload.test.mjs`.
- [x] 3.2 On inspection save failure caused by network/service unavailability, enqueue the inspection and navigate to a pending detail state.
  - [x] Queueable network/service save failures now enqueue without showing the blocking error alert.
  - [x] Pending detail navigation: new route `app/inspections/pending/[queueId].tsx` shows status pill, last error + attempts, media preview, summary fields, retry, and cancel-and-discard. After a successful queued sync the page auto-redirects to `/inspections/<remoteId>`. `enqueueInspection` in `capture/review.tsx` now `router.replace`s here instead of dropping the user back on the home tab.
- [x] 3.3 On recording upload/create failure caused by network/service unavailability, enqueue the recording and show pending upload state. `app/capture/processing.tsx` now wraps both the storage upload and `createRecording.mutateAsync` calls. Storage upload failure → enqueue with `remote_video_url: null`; DB-insert failure (after a successful upload) → enqueue with the storage URL preserved so replay only retries the row insert. Both paths call `replaySyncQueue()` so the worker picks the entry up immediately when network returns.
- [ ] 3.4 Retain local media files until their queue entries are synced or cancelled.
- [x] 3.5 Ensure duplicate taps on Save cannot create duplicate queue entries.

## 4. UI integration

- [x] 4.1 Wire Home `SyncBanner` to real queue counts and last successful sync time. Banner already read counts from `useSyncQueueEntries`; the missing piece was a real "last sync" timestamp. New `lib/sync/lastSync.ts` persists the timestamp every time `replayEntry` flips a row to `synced`. Banner now reads it via `useLastSyncedAt()` and renders a localized relative label (`just now` / `N min ago` / `Nh ago` / date) plus a `neverSynced` empty state. Home screen drops the `lastSyncIso` prop. en + th i18n parity preserved.
- [x] 4.2 Make History Synced/Pending/Failed filters real.
- [x] 4.3 Show pending/failed inspection rows in History alongside server rows.
- [ ] 4.4 Show pending/failed state on Inspection Detail and disable server-only actions until synced.
- [x] 4.5 Show pending/failed recording rows in Recordings. `app/more/recordings.tsx` now reads `useSyncQueueEntries`, picks the recording-kind rows still in pending/syncing/failed, applies the same duration + date-range filters, and renders them above the synced list under a "Pending sync" caption. Each pending row shows a status pill (Queued / Syncing / Failed), the last error when present, a Retry icon (calls `retryAllFailedQueueEntries` + `replaySyncQueue`), and a Discard icon (`removeQueueEntry` after confirm).
- [x] 4.6 Move Settings sync section to real queue counts with Retry all and Clear failed actions.
- [x] 4.7 Add EN/TH i18n labels for all sync states and actions.

## 5. Verification

- [x] 5.1 Unit tests for sync store and replay payload handling.
  - [x] Queueable sync error classifier tests.
  - [x] Queue state transitions in `transitions.test.mjs` (add / update / remove / clear-failed / retry-all / mark-failed / JSON roundtrip).
  - [x] Save-payload assembly in `savePayload.test.mjs` (notes trimming, summary fold-in, queue wrapper local/remote URI handling, photo vs video media kind, fallback when both local URIs missing).
  - [x] Replay payload checkpoint in `payloadUpdates.test.mjs` (`applyRemoteMediaUrl` writes the right field per kind; immutability; `getRemoteMediaUrl` reader symmetry).
- [x] 5.2 `pnpm -F @advance-seeds/mobile typecheck`
- [x] 5.3 `pnpm -F @advance-seeds/mobile lint`
- [x] 5.4 `pnpm -F @advance-seeds/i18n test`
- [ ] 5.5 Manual iPhone test: airplane mode Save creates pending inspection.
- [ ] 5.6 Manual iPhone test: restore network replays pending inspection and Supabase row appears.
- [ ] 5.7 Manual iPhone test: failed recording upload can retry and then share/play after sync.
- [ ] 5.8 Document the offline sync behavior in `docs/HANDOFF.md`.

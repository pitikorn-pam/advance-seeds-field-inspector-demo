# Tasks — Mobile Offline Sync

## 1. Queue foundation

- [ ] 1.1 Add `@react-native-community/netinfo` if needed for connectivity detection.
- [ ] 1.2 Create `apps/mobile/lib/sync/types.ts` with queue entry, status, inspection payload, and recording payload types.
- [ ] 1.3 Create `apps/mobile/lib/sync/store.ts` backed by AsyncStorage with list/add/update/remove helpers.
- [ ] 1.4 Add unit tests for queue state transitions and JSON serialization.
- [ ] 1.5 Add `useSyncQueue()` hook exposing counts, entries, retry, retry all, cancel, and clear failed.

## 2. Replay worker

- [ ] 2.1 Create `apps/mobile/lib/sync/replay.ts` for inspection and recording replay.
- [ ] 2.2 Replay inspection media upload, inspection insert, seed insert, and metadata update idempotently.
- [ ] 2.3 Replay recording upload and row insert idempotently.
- [ ] 2.4 Preserve uploaded public URL on the queue entry when upload succeeds but DB insert fails.
- [ ] 2.5 Mount `SyncQueueWorker` once in the mobile root layout.
- [ ] 2.6 Trigger replay on app foreground, connectivity restored, sign-in restored, and Retry all.

## 3. Capture integration

- [ ] 3.1 Refactor inspection save payload assembly out of `capture/review.tsx` into a reusable queue-safe helper.
- [ ] 3.2 On inspection save failure caused by network/service unavailability, enqueue the inspection and navigate to a pending detail state.
- [ ] 3.3 On recording upload/create failure caused by network/service unavailability, enqueue the recording and show pending upload state.
- [ ] 3.4 Retain local media files until their queue entries are synced or cancelled.
- [ ] 3.5 Ensure duplicate taps on Save cannot create duplicate queue entries.

## 4. UI integration

- [ ] 4.1 Wire Home `SyncBanner` to real queue counts and last successful sync time.
- [ ] 4.2 Make History Synced/Pending/Failed filters real.
- [ ] 4.3 Show pending/failed inspection rows in History alongside server rows.
- [ ] 4.4 Show pending/failed state on Inspection Detail and disable server-only actions until synced.
- [ ] 4.5 Show pending/failed recording rows in Recordings.
- [ ] 4.6 Move Settings sync section to real queue counts with Retry all and Clear failed actions.
- [ ] 4.7 Add EN/TH i18n labels for all sync states and actions.

## 5. Verification

- [ ] 5.1 Unit tests for sync store and replay payload handling.
- [ ] 5.2 `pnpm -F @advance-seeds/mobile typecheck`
- [ ] 5.3 `pnpm -F @advance-seeds/mobile lint`
- [ ] 5.4 `pnpm -F @advance-seeds/i18n test`
- [ ] 5.5 Manual iPhone test: airplane mode Save creates pending inspection.
- [ ] 5.6 Manual iPhone test: restore network replays pending inspection and Supabase row appears.
- [ ] 5.7 Manual iPhone test: failed recording upload can retry and then share/play after sync.
- [ ] 5.8 Document the offline sync behavior in `docs/HANDOFF.md`.

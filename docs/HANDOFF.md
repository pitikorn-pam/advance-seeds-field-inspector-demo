# Project Hand-off — Advance Seeds Field Inspector Demo

**Status: production-shaped mobile demo (v0.3.x).** Mobile is a custom dev-client running on real camera hardware with prototype-faithful navigation, the three-step capture journey, ROI tools, video recording, snapshots to Photos, ArUco + LiDAR calibration, **in-app notifications**, **dropdown-search variety/batch pickers**, **auto-tag GPS location** on captures and recordings, and a polished Library tab. ML Phase 1 now uses an on-device classical analyzer behind the `SeedAnalyzer` interface; Phase 2 TFLite/Core ML remains the next analyzer uplift.

> **Working directory:** `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`. Do **not** build from the iCloud path (`~/Library/Mobile Documents/...`) — Ruby's `require` breaks on the ZWJ emoji in the path, which kills `pod install`. See [Critical environment rules](#critical-environment-rules-read-before-any-rebuild).

> **Current remaining-work hand-off:** see [`docs/REMAINING_HANDOFF_2026-05-04.md`](./REMAINING_HANDOFF_2026-05-04.md) for the latest phase list and a ready-to-paste prompt for the next AI agent.

---

## What's running today

| Surface              | URL / How to run                                                             | Notes                                                                                |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Mobile app**       | `npx expo run:ios --device` (one-time) → JS reload over Metro for daily work | iOS + Android via custom dev-client APK / IPA. SDK 54, mocked YOLOv11n, manual calib |
| **Supabase backend** | `gqsxiohxokgwwugeoxmy.supabase.co` (cloud) + local Docker                    | 7 tables, RLS, 7 seeded inspections, 2 users, recordings + inspection metadata       |

### Demo accounts

| Email                   | Password         | Role                                      |
| ----------------------- | ---------------- | ----------------------------------------- |
| `jane@advanceseeds.com` | `DemoSeeds2026!` | inspector (sees own work, can capture)    |
| `alex@advanceseeds.com` | `DemoSeeds2026!` | admin (sees all + manages reference data) |

---

## Architecture in one diagram

```
                          ┌──────────────────────┐
              tokens ───▶ │  Mobile (Custom DC)  │
                          │  RN + NativeWind     │
                          │  Expo Router         │
                          └──────────┬───────────┘
                                     │
                                     │  Supabase JS SDK (anon key + RLS)
                                     ▼
       ┌────────────────────────────────────────────┐
       │  Supabase: Postgres + Auth + Storage       │
       │  6 tables · 5 enums · RLS per role         │
       └────────────────────────────────────────────┘
                                       ▲
                                       │  service_role (seed scripts only)
                                       │
                          ┌───────────────────────┐
                          │  supabase/scripts/    │
                          │  • seed-users         │
                          │  • seed-inspections   │
                          │  • smoke.test.mjs     │
                          └───────────────────────┘
```

---

## Repo layout

```
03 - Demo/
├── apps/
│   └── mobile/             ← Expo + RN + NativeWind
├── packages/
│   ├── tokens/             ← design tokens generated from JSON → Tailwind preset + CSS vars + TS
│   ├── types/              ← shared TS types incl. SeedAnalyzer interface, Supabase generated types
│   └── i18n/               ← en + th translation resources
├── supabase/
│   ├── migrations/         ← 5 migrations: schema, RLS, storage, recordings, inspection metadata
│   ├── seed.sql            ← reference data
│   └── scripts/            ← seed-users, seed-inspections, RLS smoke
├── docs/
│   ├── handoff/            ← original design-system handoff (preserved)
│   ├── demo-script.md      ← demo day playbook
│   └── HANDOFF.md          ← this file
├── openspec/
│   ├── specs/              ← 15 durable capability specs
│   └── changes/            ← active: (none, 4 archived)
├── .github/workflows/      ← ci.yml
└── .npmrc, pnpm-workspace.yaml, …
```

---

## What's new in v0.3.0 (post-v0.2.0 review pass)

Six user-feedback items + one chore, one commit each on `main`. All migrations are live on remote Supabase (`gqsxiohxokgwwugeoxmy`).

| Commit    | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `068e1b7` | **C1 Notifications.** New `notifications` table with RLS + JSONB metadata. Bell icon next to the Home role pill (badge = unread count); tap opens `/notifications` modal with FlatList lazy-paged at 10/page. `useNotify()` closure fired from save success/failure, recording upload (success / too-large / failed), snapshot saved. Optimistic React Query layer with `onMutate`/`onError` rollback.                                                                                                                                                                                                                                    |
| `80b0b29` | **C2 Variety/batch dropdowns.** Replaced `/capture/variety-picker` route with inline `<DropdownSearch>` typeahead. Variety mandatory (red border invalid state); batch optional. "Other" variety seeded with stable UUID `00000000-0000-4000-8000-000000000001` so unknowns flow through queries/reports normally. Continue button gated on `varietyId`.                                                                                                                                                                                                                                                                                  |
| `eb42bf5` | **C3 Mode picker.** Top safe-area edge added + inline header (back arrow + title) — fixes the flush-to-status-bar overlap. Photos permission pre-check via `MediaLibrary.getPermissionsAsync()` before either Live or Precise routes; iOS won't re-prompt after a hard deny so this naturally caps to "ask at most once".                                                                                                                                                                                                                                                                                                                 |
| `2e4c450` | **C5 Library polish.** New `<Segmented variant="tag">` — selected option keeps brand-soft fill, unselected becomes frame-only outline (the active filter reads as a tag among ghosts). Search bar over `name + scientific_name`. Variety detail back arrow + top edge fix.                                                                                                                                                                                                                                                                                                                                                                |
| `513d77c` | **C6 Session reset on Start inspection.** `Start inspection` from `/varieties/[id]` now `session.reset()` first, then sets `varietyId`. Prior `batchId / calibrationId / notes / locationTagEnabled / roi` no longer latch onto the new attempt. The `/camera` tab redirect intentionally does **not** reset (preserves "resume in-progress capture").                                                                                                                                                                                                                                                                                    |
| `1bb7923` | **C4 Auto-tag location.** `expo-location` wired. `lib/capture/location.ts` enforces "ask once per session" (module-level `ensured` flag, cache result; subsequent calls within the app session never re-prompt). iOS `NSLocationWhenInUseUsageDescription` + Android coarse/fine permissions in `app.json`. GPS attached to `inspections.metadata.location` at review-mount time and `recordings.metadata.location` at recording-finish. New `recordings.metadata` jsonb column (object-only check). **Bumps to `version: "0.3.0"` + `runtimeVersion: "0.3.0"` + Android `versionCode: 2`** because expo-location is a new native module. |
| `c0dd55b` | chore: gitignore `ios/` / `android/` (CNG / continuous native generation), switch start scripts to `expo run:ios` / `run:android`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Migrations applied to remote DB

```
20260427000002_inspections_metadata.sql   ← already there from v0.2.0 ROI metadata
20260429000001_notifications.sql          ← C1
20260429000002_other_variety.sql          ← C2
20260429000003_recordings_metadata.sql    ← C4
```

### Last remaining step (not yet done)

The **physical-device dev-client install + on-device test of C1–C6** was not completed. The simulator build with ExpoLocation linked is intact at `~/Library/Developer/Xcode/DerivedData/AdvanceSeedsFieldInspector-blscxxfhveyqzabujwdpzzobwkun/Build/Products/Debug-iphonesimulator/AdvanceSeedsFieldInspector.app`. Three devices were connected at hand-off:

```
1. PPUNGPONG's iPad (26.4.2)              — 00008112-0006305E1A78A01E
2. PPUNGPONG's iPhone 16 Pro Max (18.5)   — 00008140-000111102613001C
3. PPUNGPONG's iPhone Air (26.4.2)        — 00008150-001555E01188401C
```

To install + start Metro from the clean clone:

```bash
cd ~/Code/seed-demo/apps/mobile
./node_modules/.bin/expo run:ios --device <UDID>
```

### Critical environment rules (read before any rebuild)

1. **Never build from the iCloud path** `~/Library/Mobile Documents/.../Seed Measurement/03 - Demo`. macOS Ruby's `require` chokes on the ZWJ emoji `🧑‍💻` in the path — `File.exist?` returns true but `load`/`require` raise `LoadError` on the same string, which kills `pod install` ("cannot load such file -- .../scripts/autolinking"). Use `~/Code/seed-demo` (clean clone, kept in sync via `git pull origin main`).
2. **Never use `pnpm dlx expo`.** It fetches the latest Expo CLI (currently v55) which is incompatible with this project's SDK 54. The skew manifests as `ECONNREFUSED .../watchman/sock` because v55 bundles a different `metro-file-map`. Always run `./node_modules/.bin/expo` from `apps/mobile` (the project's own SDK-matched CLI).
3. **`ios/` and `android/` are gitignored** (CNG workflow). Source of truth is `app.json` plus the plugin block. After any new native module or plugin change, run `./node_modules/.bin/expo prebuild --platform ios --clean` (or `--platform android`) before building.
4. **The user is in confirm-before-proceed mode.** Show a plan for any non-trivial change and wait for "ok" before editing. Trivial reads / lookups are fine to do directly.

### Test plan to run after install

| Item | What to verify                                                                                                                                                                                                                                           | Reload type                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| C1   | Home: bell next to role pill. Tap → modal. Save a capture → bell badge. Lazy-paged at 10/page.                                                                                                                                                           | Metro reload                |
| C2   | setup → variety field is dropdown (red border when empty) → typeahead works → "Other" present → continue enables. Batch optional.                                                                                                                        | Metro reload                |
| C3   | setup → continue → mode picker has back arrow at top, no overlap. First Live/Precise tap prompts for Photos if undetermined.                                                                                                                             | Metro reload                |
| C5   | Library → search bar + tag-style filter (active = brand-soft fill, inactive = frame-only outline). Variety detail has back arrow.                                                                                                                        | Metro reload                |
| C6   | Mid-capture → bail → Library → variety → Start inspection → setup screen has only the new variety; batch/calibration/notes empty.                                                                                                                        | Metro reload                |
| C4   | Toggle on at setup → finish capture → at review screen, iOS shows location prompt. Allow → save → check `inspections.metadata.location` in Supabase. Re-record → no second prompt. Hard-deny → alert with Settings link, save proceeds without location. | **Native rebuild required** |

### Verifying DB state

Use the Supabase Dashboard SQL editor (https://supabase.com/dashboard/project/gqsxiohxokgwwugeoxmy/sql/new) or the CLI:

```bash
rtk supabase db query "select id, metadata from public.inspections order by created_at desc limit 5;" --linked
rtk supabase db query "select id, metadata from public.recordings order by captured_at desc limit 5;" --linked
rtk supabase db query "select id, kind, title, read_at from public.notifications order by created_at desc limit 10;" --linked
rtk supabase db query "select id, name from public.varieties where id = '00000000-0000-4000-8000-000000000001';" --linked
```

### v0.3.0 file/path cheat-sheet

```
apps/mobile/
  lib/capture/location.ts                  ← NEW: ask-once-per-session GPS policy
  lib/capture/session.ts                   ← capturedLocation field added
  lib/queries.ts                           ← useCreateRecording accepts metadata
  lib/notifications.ts                     ← NEW: useNotify() closure
  components/ui/Segmented.tsx              ← new variant="tag"
  components/ui/DropdownSearch.tsx         ← NEW generic typeahead
  components/home/NotificationBell.tsx     ← NEW
  app/notifications.tsx                    ← NEW modal route
  app/capture/{setup,mode,review,scan,precise}.tsx  ← all touched
supabase/migrations/
  20260429000001_notifications.sql         ← C1
  20260429000002_other_variety.sql         ← C2
  20260429000003_recordings_metadata.sql   ← C4
```

---

## Offline sync queue

The mobile app keeps inspections and recordings recoverable when the network drops mid-save. A persistent queue replays the work once Supabase is reachable again, and the UI surfaces the pending state so the user knows what's still in flight.

### Lifecycle

```
capture → save attempt
            │
            ├── network OK → write row + media → Supabase  ✅
            │
            └── network/RLS/timeout error
                        │
                        └── enqueue → AsyncStorage queue
                                            │
                                            └── replaySyncQueue (boot, AppState=active, retry-all)
                                                       │
                                                       ├── upload media → store remote URL on entry
                                                       ├── insert row(s) → mark synced + record last-sync time
                                                       └── delete local file
```

Every replay step that succeeds is checkpointed onto the queue entry's payload, so a partial failure on the next retry doesn't double-upload or duplicate writes. Once the worker flips an entry to `synced`, the local capture file is released.

### Where things live

| Concern                            | Module                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| Queue store + state transitions    | `apps/mobile/lib/sync/store.ts` (mirror `transitions.mjs` for tests) |
| Replay worker                      | `apps/mobile/lib/sync/replay.ts`                                     |
| Last-successful-sync timestamp     | `apps/mobile/lib/sync/lastSync.ts`                                   |
| Per-payload URL checkpoint         | `apps/mobile/lib/sync/payloadUpdates.ts`                             |
| Local-file cleanup                 | `apps/mobile/lib/sync/localMedia.ts`                                 |
| Queueable error classifier         | `apps/mobile/lib/sync/errors.ts`                                     |
| Save-payload assembly (queue-safe) | `apps/mobile/lib/inspections/savePayload.ts`                         |

### UI surfaces

- **Home → SyncBanner** reads queue counts + the persisted last-sync timestamp; renders `Up to date` / `N pending` / `N failed` with a localized relative-time label.
- **Settings → Sync** has counts, Retry all, Clear failed. Retry-all also recovers entries stuck in `syncing` (e.g. interrupted by a force-quit).
- **Pending inspection detail** at `/inspections/pending/[queueId]` shows the captured image, summary, status pill, last error, retry, and discard. Auto-redirects to `/inspections/<remoteId>` when the entry syncs.
- **Recordings list** (`/more/recordings`) renders pending/failed recording rows above the synced list, each with retry + discard actions.

### Dev / QA notes

- Fast-refresh resets the in-memory queue listeners, but the queue itself lives in AsyncStorage. The `replaySyncQueue` worker uses a `running` flag + `rerunPending` so a tap during an in-flight replay schedules another sweep instead of silently dropping.
- The AsyncStorage key is `advance-seeds.syncQueue.v1`; bumping the suffix forces a fresh queue if a payload shape ever breaks. The last-sync timestamp lives at `advance-seeds.lastSyncedAt.v1`.
- Tests: `apps/mobile/lib/sync/transitions.test.mjs`, `payloadUpdates.test.mjs`, and `apps/mobile/lib/inspections/savePayload.test.mjs` cover state transitions, mid-flight URL checkpointing, and save-payload assembly without needing AsyncStorage or Supabase.

### Manual QA recipe (still pending on a wired device)

1. Toggle airplane mode on the iPhone Air.
2. Capture an inspection → review → Save and sync. Expect to land on `/inspections/pending/<id>` with status pill **Queued**.
3. Disable airplane mode. Within ~1 sec the page should auto-redirect to `/inspections/<remoteId>`.
4. Repeat for a video recording: long-press shutter → process. The Recordings list should show the pending row, then move to the synced list when network returns.
5. Force-quit during step 3 to verify the entry can recover via Settings → Sync → Retry all.

---

## What ships in v0.2.0

### What's new since v0.1.0

The mobile app moved from "CRUD over a sample image in Expo Go" to **production-shaped capture** in a custom dev-client:

- **Three-step capture journey** — Setup (variety / batch / calibration / notes / location toggle) → Mode picker (Live vs Precise) → Camera. Mirrors the prototype.
- **Live mode** — `react-native-vision-camera` preview + KPI strip ticking in real time, ROI tools (rect / polygon / circle), per-seed centroid filtering.
- **Precise mode** — corner brackets, "Hold steady", calibration banner with px/mm + profile name (manual calibration via Phase 5 partial).
- **Capture chrome** — flash with torch-bracket workaround for iOS 26, camera flip, rule-of-thirds grid, recording timer overlay.
- **Recording + snapshots** — long-press shutter records video to Supabase Storage; snapshot button saves the current frame to Photos.
- **Processing + review** — orb-and-checklist analyzer ceremony, GradeRing + per-seed list on review, two-button save (Save draft / Save and sync).
- **Detail screens** — per-seed detail (`/seed/[inspection]/[index]`), variety detail with hero + reference dimensions, recordings list, profile.
- **Bottom tab bar** — `Home / Inspect / Library / More` (prototype-fidelity-pass D1) with a hero-card Home, family-segmented Library, and a "More" overflow menu collapsing every secondary destination.
- **Phase 5 — manual calibration** — Inspector picks a calibration profile in Setup; precise mode banner reads "Calibration locked · 24.7 px/mm · Lab tray". ArUco / LiDAR are dormant pending native modules.

### Capabilities (each is a testable spec in `openspec/specs/`)

1. **`project-foundation`** — pnpm monorepo, token pipeline, strict TS, conventional commits (4 reqs)
2. **`supabase-backend`** — schema, RLS, seeded data, storage, generated types (5 reqs)
3. **`authentication`** — email/password sign-in, role-based gating, session persistence (4 reqs)
4. **`inspections-management`** — three-step capture, mocked ML, list/detail/per-seed, role-aware delete (6 reqs)
5. **`reference-data-management`** — varieties + batches CRUD, calibration + profiles read-only (4 reqs)
6. **`reporting-and-export`** — filters, KPIs, CSV export with locked column order (3 reqs)
7. **`internationalization`** — EN + TH parity, device-locale default, no raw English in JSX (3 reqs)
8. **`theming`** — light + dark mode, tokens-only (no inline hex), system-following toggle (3 reqs)
9. **`mobile-navigation`** — bottom tab bar shape, More menu groupings, three-step capture journey, Home dashboard composition (5 reqs, added by `prototype-fidelity-pass`)

### Quality gates that ship

- `pnpm -r typecheck` — 5 workspaces, strict TS, no `any` without justification
- `pnpm -r lint` — ESLint 9 flat config + i18n raw-string lint on `apps/`
- `pnpm -r test` — token parity + i18n parity + Supabase RLS smoke
- `pnpm format` — Prettier across the workspace
- CI runs all of the above on every PR + an OpenSpec validate job
- `openspec validate` — every active change must pass before archiving

---

## Handing off to the build team

### What's stable and ready to extend

- **The `SeedAnalyzer` interface** (`packages/types/src/analyzer.ts`) is the seam for real ML. Add `TfliteSeedAnalyzer` (production) or `CoreMLSeedAnalyzer` (Apple Neural Engine) as new implementations; screens never touch a concrete analyzer.
- **The Supabase schema** is already production-shaped — RLS, FK constraints, JSONB for flexible defects, immutable inspection rows. Adding new fields is a migration; adding new roles is one column + a few policy entries.
- **The token pipeline** is the source of truth for visual identity. Editing `docs/handoff/design-tokens.json` regenerates all consumers (Tailwind preset, CSS vars, TS export). The Swift/Kotlin stubs in `docs/handoff/` are the contract for the eventual native rebuild.
- **The CSV export column order** is locked in `openspec/specs/reporting-and-export/spec.md` — any change is a new spec, not a silent edit.

### What needs follow-up before production

| Item                                             | Where                                                                               | Estimated effort |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------- |
| Real YOLOv11n integration (Phase 4)              | swap `MockSeedAnalyzer` for TFLite + CoreML in `apps/mobile/lib/analyzer/`          | 3–5 days         |
| Live calibration (ArUco + LiDAR; Phase 5 part-2) | custom Expo Modules wrapping OpenCV (Swift / Kotlin) + ARKit                        | 1–2 weeks        |
| iOS distribution                                 | Apple Developer Program enrollment then EAS preview profile + Firebase App Dist     | 2 days           |
| Skia detection-overlay rings on Live mode (6.1)  | needs Phase 4 frame source                                                          | 1 day            |
| Polygon vertex drag + circle radius drag         | extend `RoiOverlay`'s rect handle pattern to other shapes                           | 4 hours          |
| Reference dimensions on `varieties`              | migration adds `reference_length_mm` / `reference_width_mm`; Library row uses these | 2 hours          |
| Real seed photos                                 | replace branded placeholders in `supabase/seed.sql`                                 | 1 hour           |
| `expo-file-system` `/legacy` → new `Paths/File`  | `apps/mobile/app/reports.tsx` + capture upload paths                                | 2 hours          |

### Total to production beta: **6–10 weeks** (down from v0.1's 8–12 because three-step capture, ROI tools, recording, snapshot, profile/library/history surfaces are all now demo-shipped)

---

## How to run things locally

```bash
# Install
pnpm install

# Start Supabase locally (Docker)
pnpm supabase:start

# Apply schema (one-time per fresh project)
pnpm supabase:types
pnpm supabase:seed-all

# Run mobile via custom dev client
# First-time per device: builds + installs the dev-client APK / IPA.
cd apps/mobile && npx expo run:ios --device   # or --device for Android via EAS
# Daily: just start Metro and reload over LAN. The installed dev-client
# fetches the JS bundle on each reload.
pnpm -F @advance-seeds/mobile start

# Heads-up: this repo lives on iCloud Drive on Mac. CocoaPods and
# Metro both have issues with iCloud paths (emoji in path, file
# eviction). Build from a clean clone outside iCloud, e.g.
#   git clone <repo> ~/Code/seed-demo

# Verify everything
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm format:check
pnpm supabase:smoke   # 5 RLS tests against the live stack
```

---

## How to push schema to a fresh Supabase project

```bash
cd supabase
SUPABASE_DB_PASSWORD='<password>' supabase link --project-ref <ref>
supabase db push
supabase db query --linked --file seed.sql
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm supabase:seed-all
```

---

## Spec-driven workflow (OpenSpec)

The discipline: every meaningful change is a `proposal.md` + `design.md` + `tasks.md` + delta `specs/` BEFORE code. The CI validates the spec on every PR.

```bash
openspec new change <kebab-name>     # scaffold
# … edit proposal/design/tasks/specs …
openspec validate <name>             # check
# … implement, tick tasks, run tests …
openspec archive <name>              # promote deltas into specs/
```

The first 4 changes (`seed-inspector-demo-foundation`, `prototype-fidelity-pass`, `mobile-real-usage`, `mobile-offline-sync`) are archived. Future work follows the same pattern.

---

## Decisions worth remembering (full rationale in `openspec/changes/archive/.../design.md`)

- **D1 — Vite over Next.js**: GH Pages is static; we don't need API routes.
- **D2 — Expo over native**: one codebase, both platforms. Started on Expo Go in v0.1; v0.2 moved to a custom dev-client because we needed Vision Camera + Photos library + future TFLite. The design tokens are still the contract for an eventual native rebuild.
- **D3 — Supabase**: BaaS with Postgres + Auth + Storage + RLS. Free tier covers the demo; self-host is a Docker compose if compliance demands.
- **D4 — `SeedAnalyzer` adapter**: ML lives behind an interface. Mock for demo, real for production, no screen changes between them.
- **D5 — Two roles only**: inspector + admin, enforced in RLS not just UI.
- **D6 — Bottom tabs adapt prototype, not copy it** (v0.2): prototype is `Home / History / Library / Profile`; we ship `Home / Inspect / Library / More`. Camera is elevated to a tab because it's the primary action; More collapses the breadth of admin screens (Profile / Settings / History / Reports / Batches / Calibration / Recordings) that the prototype's lone Profile tab couldn't comfortably absorb. Spec'd in `openspec/specs/mobile-navigation/`.
- **D7 — `metadata jsonb` over typed columns** (v0.2): inspections gain a generic metadata bag instead of one column per capture-time field. ROI shape lives there today; calibration confidence + analyzer ID + frame format will join. Trade-off: less DB-level type safety; mitigated by `InspectionMetadata` TS type as the source-of-truth shape.
- **D8 — Manual calibration before automatic** (v0.2 Phase 5 partial): inspector picks a profile; banner reads its static px/mm. ArUco / LiDAR (automatic) are deferred to a separate sprint with custom Expo Modules. Manual gets us 80% of the demo value at 5% of the cost.

---

## Where to read next

| You want to know…                   | Open this                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Why decisions were made             | `openspec/changes/archive/2026-04-26-seed-inspector-demo-foundation/design.md` |
| What the system is contracted to do | `openspec/specs/<capability>/spec.md`                                          |
| How to run the demo on demo day     | `docs/demo-script.md`                                                          |
| How tokens are generated            | `packages/tokens/src/build.ts` + `mapping.ts`                                  |
| Backend operations                  | `supabase/README.md`                                                           |
| Original design system              | `docs/handoff/HANDOFF.md` + `docs/handoff/DESIGN_SYSTEM.md`                    |

---

_Hand-off updated at v0.3.0 (2026-05-03). Update this file at every major milestone._

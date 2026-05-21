# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Audience:** a new engineer taking over the Advance Seeds Field Inspector **demo app** (Expo mobile + Supabase backend). Read this end-to-end before touching code. The sibling ML repo has its own `CLAUDE.md`.

## What this repo is

The customer-facing presale deliverable: a **native mobile app for field inspectors** (Expo / React Native, TypeScript) that captures fruit/seed photos and video, runs **on-device instance segmentation**, measures dimensions in millimeters via calibration, and syncs inspections to Supabase. The ML core is consumed via a runtime seam (`SeedAnalyzer`) — model artifacts come from the sibling `advance-seeds-field-inspector-ml` repo. Until real artifacts land for every class, parts of the analyzer are mocked.

## Tech stack at a glance

| Layer         | Stack                                                                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile app    | Expo SDK 54 · React Native 0.81 · React 19 · TypeScript (strict) · expo-router (file-based routing)                                                                                                                                                   |
| Native vision | `react-native-vision-camera` 4 · `react-native-worklets` · `vision-camera-resize-plugin` · `react-native-fast-tflite` (Android) · custom `coreml-runner` module (iOS) · custom `aruco-calibrator` + `lidar-calibrator` + `roi-video-exporter` modules |
| Styling       | NativeWind 4 · TailwindCSS 3 · design tokens from `packages/tokens` (do **not** hand-write hex/px)                                                                                                                                                    |
| State / data  | `@tanstack/react-query` 5 · `@supabase/supabase-js` 2 · `@react-native-async-storage/async-storage` for auth persistence                                                                                                                              |
| i18n          | `i18next` + `react-i18next` · resources in `packages/i18n` · enforced by `eslint-plugin-i18next` (no hardcoded English in components)                                                                                                                 |
| Icons         | `lucide-react-native`                                                                                                                                                                                                                                 |
| Backend       | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)                                                                                                                                                                                      |
| Distribution  | EAS Build · Firebase App Distribution (Android APK + iOS IPA)                                                                                                                                                                                         |
| Repo plumbing | pnpm 10.33.2 workspaces · Husky · commitlint · Prettier · lint-staged · ESLint 9 · `typescript-eslint`                                                                                                                                                |
| Spec workflow | OpenSpec (`openspec/`)                                                                                                                                                                                                                                |

## Repo layout

```text
apps/mobile/              Expo app
  app/                    expo-router screens (file-based)
    (tabs)/               Bottom tab navigator (capture, inspections, more, …)
    capture/              Capture journey screens
    inspections/          Inspection list / detail
    seed/  varieties/     Reference data screens
    notifications/  more/ Misc tabs
    welcome.tsx splash.tsx login.tsx calibration.tsx reports.tsx settings.tsx profile.tsx
  components/             Reusable UI (cards, buttons, camera HUD, …)
  modules/                Local native modules:
    aruco-calibrator/     ArUco marker detection → px_per_mm
    lidar-calibrator/     LiDAR depth path
    coreml-runner/        iOS Core ML inference bridge
    roi-video-exporter/   Trim & export ROI video
  lib/                    App-level glue:
    supabase.ts           Supabase client + session bootstrapping
    queries.ts            All react-query hooks against Supabase (the data layer)
    auth.tsx              Auth context provider
    access.ts             Role/permission gating
    i18n.ts               i18next bootstrap
    notifications.ts onboarding.ts theme.tsx strings.ts
  plugins/                Expo config plugins (native module wiring)
  assets/                 Fonts, images, **model artifacts** (`assets/models/`)
  scripts/                Local build + distribution helpers
  app.json eas.json       Expo + EAS config
  metro.config.js         Metro w/ NativeWind + monorepo resolution
  tailwind.config.cjs     Tailwind using tokens from @advance-seeds/tokens
  global.css              Tailwind layer + design-token CSS vars
packages/
  tokens/                 Design tokens (TS + CSS vars + Tailwind preset) generated from docs/handoff/design-tokens.json
  types/                  Shared TS types — including the SeedAnalyzer interface
  i18n/                   en + th translation resources
supabase/
  migrations/             SQL migrations (timestamp-prefixed)
  scripts/                Type generator, seed-users, seed-all, smoke tests
  seed.sql config.toml    Local Supabase stack config + seed
docs/
  HANDOFF.md              Master onboarding handoff (read this!)
  HANDOFF_TO_AGENT.md     Agent-facing handoff
  REMAINING_HANDOFF_2026-05-*.md  Rolling status logs — latest = most current state
  demo-script.md          Demo flow for the customer presentation
  firebase-app-distribution.md  Distribution runbook
  model-registry-service-integration.md  How the app talks to the ML repo's registry
  calibration/  design-review/  handoff/  Subtopic docs
DESIGN.md                 Design DNA (colors, type, do/don't) — single source for visual decisions
openspec/                 Specs + active change proposals
  specs/                  Canonical capability specs (authentication, supabase-backend, …)
  changes/                In-flight change proposals
.agents/ .claude/         Claude Code agent / skill config
```

## Prerequisites

- **Node.js** ≥ 20.19 (see `.nvmrc`).
- **pnpm** 10.33.2 — `corepack enable && corepack prepare pnpm@10.33.2 --activate`.
- **Watchman** on macOS — `brew install watchman`. **Required.** Without it, Metro deadlocks silently when this repo lives under iCloud Drive (`~/Library/Mobile Documents/...`). Symptom: "Reloading…" forever in the dev client, `/status` returns OK but bundles never finish.
- **EAS CLI** for builds: `npm i -g eas-cli`, then `eas login`.
- **Supabase CLI** for local stack + type generation: `brew install supabase/tap/supabase`.
- **Docker Desktop** if you want to run the local Supabase stack.
- **Xcode** (iOS) and/or **Android Studio** (Android) — only needed for `expo run:*`; EAS builds remotely.
- **Apple Developer Program ($99/yr)** — required for iOS distribution, even through Firebase. There is no workaround.

## Quickstart

```bash
# 1. Install deps for the whole workspace
pnpm install

# 2. Configure mobile env (Supabase URL + anon key)
cp apps/mobile/.env.example apps/mobile/.env.local
#   then edit .env.local — only EXPO_PUBLIC_* vars are inlined at build time

# 3. (Optional) Spin up local Supabase + apply migrations
pnpm supabase:start
pnpm supabase:types          # regenerate packages/types/src/supabase.gen.ts
pnpm supabase:seed-users     # create the Jane + Alex demo users
# pnpm supabase:seed-all     # reference data + sample inspections
# pnpm supabase:smoke        # RLS smoke tests

# 4. Build a custom dev client (required — Expo Go cannot run this app)
cd apps/mobile
eas init                                            # first time only
eas build --profile development --platform android  # ~15-20 min
# When you have an Apple cert:
# eas build --profile development --platform ios

# 5. Install the resulting APK / IPA on the device, then start Metro
pnpm -F @advance-seeds/mobile start
```

The dev client reconnects to Metro automatically on subsequent runs.

## Demo accounts

| Email                   | Role      |
| ----------------------- | --------- |
| `jane@advanceseeds.com` | inspector |
| `alex@advanceseeds.com` | admin     |

Passwords are set in `supabase/scripts/` seed-users. Refer to the script for current credentials.

## Workspace scripts (run from repo root)

| Command                                  | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                               | run every workspace's dev script in parallel                             |
| `pnpm build`                             | build every workspace                                                    |
| `pnpm lint`                              | ESLint across every workspace                                            |
| `pnpm typecheck`                         | `tsc --noEmit` across every workspace                                    |
| `pnpm format` / `pnpm format:check`      | Prettier write / verify                                                  |
| `pnpm supabase:start` / `:stop`          | local Supabase stack (Docker)                                            |
| `pnpm supabase:types`                    | regenerate `packages/types/src/supabase.gen.ts` from the local DB schema |
| `pnpm supabase:seed-users` / `:seed-all` | seed demo users / full demo data                                         |
| `pnpm supabase:smoke`                    | RLS smoke tests against the local stack                                  |

Mobile-only scripts (run from `apps/mobile`):

| Command                               | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `pnpm start`                          | Metro dev server (use after a dev client is installed)         |
| `pnpm android` / `pnpm ios`           | local prebuild + run (rarely used — EAS is the path of record) |
| `pnpm typecheck`                      | smoke test before kicking an EAS build                         |
| `pnpm lint`                           | ESLint on `app components lib`                                 |
| `pnpm build:preview:android:local`    | local APK via `scripts/build-android-release-local.mjs`        |
| `pnpm build:preview:android` / `:ios` | EAS preview build                                              |
| `pnpm dist:android` / `dist:ios`      | upload built artifact to Firebase App Distribution             |

## How distribution works

- **Android:** `eas build` → signed APK → `pnpm dist:android` pushes it to Firebase App Distribution → testers download via the Firebase link. No Apple involvement.
- **iOS:** `eas build` → signed IPA (needs the paid Apple Developer Program + a registered device UDID for ad-hoc, or TestFlight for broader testing) → `pnpm dist:ios` → Firebase App Distribution. Without Apple Developer enrollment iOS distribution is impossible — there is no Firebase-only escape hatch.
- **Production OTA updates:** `expo-updates` is wired in. Native code changes still require a fresh EAS build.

See `docs/firebase-app-distribution.md` for the full runbook (signing keys, tester groups, release notes).

## How Supabase is wired up

- Client created in `apps/mobile/lib/supabase.ts` with `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`; auth session persists via `@react-native-async-storage/async-storage` and is refreshed on app foreground.
- Auth context: `apps/mobile/lib/auth.tsx`. Role/permission gating: `apps/mobile/lib/access.ts`.
- **All data reads/writes go through react-query hooks in `apps/mobile/lib/queries.ts`** — keep that file as the single data-access layer. Don't scatter `supabase.from(...)` calls across screens.
- Schema is owned by `supabase/migrations/` and seeded by `supabase/scripts/`. Generated TS types land in `packages/types/src/supabase.gen.ts` via `pnpm supabase:types`. **Always regenerate after a migration** — the app will type-check against the new schema immediately.
- RLS is mandatory. Touch a policy → add a row to `supabase/scripts/smoke` and run `pnpm supabase:smoke`.
- **Edge Functions** (model-registry surface) live in the sibling ML repo's `supabase/functions/`. Both repos point at the same Supabase project. If you move a function, update both repos' migrations.

## How the model integration works

The mobile app does not talk to a remote inference API. It runs models on-device:

- The `SeedAnalyzer` interface (defined in `packages/types`) is the single seam. Implementations:
  - **Android:** `TfliteSeedAnalyzer` using `react-native-fast-tflite`, model file at `apps/mobile/assets/models/yolo11n-seeds.tflite`.
  - **iOS:** `CoreMLSeedAnalyzer` using the local `coreml-runner` native module, model file at the same `assets/models/` path with the matching `.mlmodel` / `.mlmodelc`.
- **The filename `yolo11n-seeds.tflite` is a frozen alias** — it ships YOLO26n-seg weights despite the historical name. Don't rename without an OpenSpec change in both repos.
- Calibration produces `px_per_mm` so the analyzer's pixel outputs become millimeters. Sources, in priority order: ArUco marker (`aruco-calibrator` module), LiDAR depth (`lidar-calibrator` module), or a manually-entered known-size reference.
- Dynamic model loading (browse + download trained models from the registry) is in flight — see `docs/model-registry-service-integration.md` and the matching openspec change.

The training/export side of all this lives in the sibling ML repo. When a new model version is published, drop the new TFLite + Core ML + `model-metadata.json` into `apps/mobile/assets/models/` via the ML repo's `scripts/export_to_demo.py`.

## Design and i18n discipline

- **`DESIGN.md` is the source of truth** for color, typography, spacing, components, and do/don't rules. Read it before any UI work.
- **Design tokens are machine-readable** at `docs/handoff/design-tokens.json`. `packages/tokens` consumes that file and emits Tailwind preset + CSS vars + TS tokens. **No raw hex / px in component code** outside the token layer, camera glass overlays (documented exception), or generated export code.
- All UI strings must go through `t()` from `react-i18next`. ESLint (`eslint-plugin-i18next`) flags hardcoded English. Keep en + th parity in every resource file under `packages/i18n`.
- Button shape: rectangular with 8px radius. Pills are reserved for status badges, role chips, and segmented filters. Don't turn buttons into pills.

## Git and commit conventions

- **Conventional Commits**, enforced via commitlint + Husky: `feat: …`, `fix: …`, `chore: …`, `docs: …`, `refactor: …`, `test: …`, `style: …`, `perf: …`, `ci: …`, `build: …`.
- `lint-staged` runs Prettier on staged files on commit.
- `prepare` hook is `husky` — runs automatically after `pnpm install`.

## Spec-driven development (OpenSpec)

OpenSpec is mandatory for non-trivial changes. Active change directories live under `openspec/changes/`; canonical specs under `openspec/specs/` (authentication, supabase-backend, live-camera-capture, live-calibration, mobile-distribution, mobile-offline-sync, reporting-and-export, …).

Driver commands inside Claude Code: the `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore` skills, or the matching `/opsx:*` slash commands. Workflow per change:

1. Propose: create `openspec/changes/<change-name>/proposal.md` + `design.md` + `tasks.md` + spec deltas.
2. Apply: implement, keep `tasks.md` in sync.
3. Validate: `openspec validate <change>` (or `openspec validate --all --strict`).
4. Archive: `openspec-archive-change` moves it under `openspec/changes/archive/`.

## What the docs/ folder is good for

The `docs/` folder is **the** institutional memory. New engineer, read in this order:

1. `docs/HANDOFF.md` — master handoff (33 KB; covers the whole journey, calibration, recording, sync, navigation).
2. `docs/REMAINING_HANDOFF_2026-05-20.md` — most recent status snapshot. Older `REMAINING_HANDOFF_2026-05-*` files trail off in relevance fast.
3. `docs/demo-script.md` — how the customer demo is run; useful to understand the golden path.
4. `docs/firebase-app-distribution.md` — distribution runbook.
5. `docs/model-registry-service-integration.md` — integration plan with the ML repo.

## Common pitfalls

- **Don't run in Expo Go.** Native modules (`react-native-vision-camera`, `react-native-fast-tflite`, custom calibrators) make Expo Go silently broken. Always use a custom dev client.
- **Always regenerate types after a migration** (`pnpm supabase:types`). Stale types hide real type errors that show up later in CI.
- **Don't bypass the `SeedAnalyzer` seam.** Calling TFLite/Core ML directly from a screen will break the platform-swap story and the future remote-loading flow.
- **Don't introduce a new color or spacing in code.** Add it to `docs/handoff/design-tokens.json`, regenerate `packages/tokens`, then consume the named token.
- **`packages/types` is the cross-repo contract.** Edit with the same care as a public API; the ML repo's exported metadata must match.
- **iCloud + Metro + no Watchman = silent deadlock.** Install Watchman first.

# Advance Seeds Field Inspector — Demo

Presale demo for the Advance Seeds Field Inspector platform.
A web dashboard for the R&D team and a native mobile app (Expo) for field inspectors, sharing one Supabase backend.

> **Status:** scaffolding phase. ML core is **mocked** for the demo. Real YOLOv11n integration is post-presale.

---

## What's in here

```
apps/dashboard          → Vite + React + TS, deployed to GitHub Pages
apps/mobile             → Expo + RN + TS, distributed via Expo Go
packages/tokens         → design tokens generated from docs/handoff/design-tokens.json
packages/types          → shared TS types incl. SeedAnalyzer interface
packages/i18n           → en + th translation resources
supabase/               → migrations, seed scripts, RLS policies
docs/handoff/           → original design-system handoff (preserved)
openspec/               → spec-driven dev artifacts
```

## Prerequisites

- **Node.js** 20.19+ (see [`.nvmrc`](./.nvmrc))
- **pnpm** 9+ — install via `corepack enable` then `corepack prepare pnpm@10.33.2 --activate`,
  or via the standalone installer: `curl -fsSL https://get.pnpm.io/install.sh | bash`
- **Watchman** (macOS) — `brew install watchman`. Required for Metro on this
  workspace. Without it, Metro's filesystem walker deadlocks against
  iCloud Drive's File Provider when this repo is checked out under
  `~/Library/Mobile Documents/`. The deadlock is silent — Metro answers
  `/status` but never returns bundles. Symptom: "Reloading…" forever in
  the dev client.

## Quickstart

```bash
# 1. Install deps for the whole workspace
pnpm install

# 2. Set up env (fill in Supabase URL + anon key from your project owner)
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

# 3. Apply Supabase schema and seed (one-time per project)
pnpm supabase:types
pnpm supabase:seed-users

# 4. Run dev servers (dashboard at :5173, Expo dev tools open separately)
pnpm dev
```

## Demo accounts

| Email                   | Password             | Role      |
| ----------------------- | -------------------- | --------- |
| `jane@advanceseeds.com` | (set in seed script) | inspector |
| `alex@advanceseeds.com` | (set in seed script) | admin     |

## Demo distribution

### Dashboard (web)

Live URL: <https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/>

Auto-deploys on every merge to `main` via [`.github/workflows/deploy-dashboard.yml`](.github/workflows/deploy-dashboard.yml). The workflow builds with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` from repo settings, then publishes `apps/dashboard/dist/` to the `gh-pages` branch.

**One-time setup on the GitHub repo:**

1. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `gh-pages` / `(root)`.
2. **Settings → Variables → Actions** → add `VITE_SUPABASE_URL` (= `https://gqsxiohxokgwwugeoxmy.supabase.co`).
3. **Settings → Secrets → Actions** → add `VITE_SUPABASE_ANON_KEY` (the anon key — yes, it's safe in client bundles, but keeping it as a secret keeps it out of action logs).

The `404.html` shim (in `apps/dashboard/public/`) handles deep-link bouncing so URLs like `/inspections/abc` survive a hard reload on GitHub Pages.

### Mobile (custom dev client + Firebase App Distribution)

> v0.2.0 introduces real camera + ML + calibration. These need native modules
> (`react-native-vision-camera`, future TFLite + ArUco bridges) that **don't run
> in Expo Go**. We ship a custom dev client built by EAS Build instead.

**Distribution channels:**

| Platform | Channel                                         | Apple Developer needed? |
| -------- | ----------------------------------------------- | ----------------------- |
| Android  | Firebase App Distribution (signed APK download) | No                      |
| iOS      | Firebase App Distribution (signed `.ipa`)       | **Yes — $99/yr**        |

iOS signing always requires the paid Apple Developer Program; Firebase only changes the _delivery_ channel, not the signing requirement. Android has no equivalent restriction — any signed APK installs.

**Build a dev client** (one-time per device, ~15-20 minutes for the EAS build):

```bash
# 1. Log in to your Expo account
eas login

# 2. Initialize the EAS project (first time only)
cd apps/mobile
eas init

# 3. Build a dev client APK for Android (Z Flip 7 FE / any Android phone)
eas build --profile development --platform android

# 4. (When Apple cert is ready) build the iOS dev client
eas build --profile development --platform ios
```

EAS prints a build URL when finished. Install the resulting APK on your phone (enable "install from unknown sources" once), or open the iOS link via TestFlight / Firebase.

**Run the dev server** (every time you start coding):

```bash
pnpm -F @advance-seeds/mobile start
```

The dev client on your phone reconnects to Metro automatically — no QR scan needed after the first install.

**Smoke test** (no native build needed): run `pnpm -F @advance-seeds/mobile typecheck` to confirm everything resolves before kicking off an EAS build.

## Workspace scripts

| Command                    | What it does                                    |
| -------------------------- | ----------------------------------------------- |
| `pnpm dev`                 | run all apps in dev mode (parallel)             |
| `pnpm build`               | build every workspace                           |
| `pnpm lint`                | lint every workspace                            |
| `pnpm typecheck`           | typecheck every workspace                       |
| `pnpm format`              | Prettier-format every file                      |
| `pnpm supabase:types`      | regenerate `packages/types/src/supabase.gen.ts` |
| `pnpm supabase:seed-users` | create Jane + Alex users in Supabase            |
| `pnpm supabase:start`      | start the local Supabase stack (Docker)         |
| `pnpm supabase:stop`       | stop the local Supabase stack                   |
| `pnpm supabase:smoke`      | run RLS smoke tests against the local stack     |

## Spec-driven development with OpenSpec

Specs and change proposals live in [`openspec/`](./openspec/).

```bash
openspec list                                    # list active changes
openspec show seed-inspector-demo-foundation     # render the foundation change
openspec validate seed-inspector-demo-foundation # validate the change
```

Inside Claude Code, the `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, and `/opsx:explore` slash commands automate the full workflow.

## Conventions

- **TypeScript strict** everywhere; no `any` without justification.
- **Conventional commits** enforced via commitlint + Husky (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, …).
- **Prettier** runs format-on-save in VS Code; `lint-staged` formats on commit.
- All UI strings via `t()` — no hardcoded English in components.
- Token names mirror [`docs/handoff/design-tokens.json`](./docs/handoff/design-tokens.json) — no inline hex / px outside the token layer.

## Why this stack

See [`openspec/changes/seed-inspector-demo-foundation/design.md`](./openspec/changes/seed-inspector-demo-foundation/design.md) for the full architectural rationale (decisions D1–D9, risks, and the ML adapter pattern).

## License

UNLICENSED — internal presale artifact.

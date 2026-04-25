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

- **Dashboard**: https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/
- **Mobile**: install Expo Go on the demo phone, scan the QR shown by `pnpm -F mobile start`

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

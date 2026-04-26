# Project Hand-off — Advance Seeds Field Inspector Demo

**Status: presale demo complete (v0.1.0).** Two surfaces ship to a real user, one Supabase backend serves both, ML is mocked behind a stable interface, and every requirement has a testable scenario archived in `openspec/specs/`.

---

## What's running today

| Surface              | URL / How to run                                                             | Notes                                                    |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Web dashboard**    | <https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/> | Auto-deploys on every merge to `main` via GitHub Actions |
| **Mobile app**       | `pnpm -F @advance-seeds/mobile start` → scan QR with Expo Go                 | iOS + Android, SDK 54, mocked YOLOv11n                   |
| **Supabase backend** | `gqsxiohxokgwwugeoxmy.supabase.co` (cloud) + local Docker                    | 6 tables, RLS, 7 seeded inspections, 2 users             |

### Demo accounts

| Email                   | Password         | Role                                      |
| ----------------------- | ---------------- | ----------------------------------------- |
| `jane@advanceseeds.com` | `DemoSeeds2026!` | inspector (sees own work, can capture)    |
| `alex@advanceseeds.com` | `DemoSeeds2026!` | admin (sees all + manages reference data) |

---

## Architecture in one diagram

```
┌──────────────────────┐                ┌──────────────────────┐
│  Web Dashboard       │                │  Mobile (Expo Go)    │
│  Vite + React + TS   │◀── tokens ─▶ │  RN + NativeWind     │
│  GitHub Pages        │                │  Expo Router         │
└──────────┬───────────┘                └──────────┬───────────┘
           │                                       │
           │  Supabase JS SDK (anon key + RLS)     │
           ▼                                       ▼
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
│   ├── dashboard/          ← Vite SPA → GitHub Pages
│   └── mobile/             ← Expo + RN + NativeWind
├── packages/
│   ├── tokens/             ← design tokens generated from JSON → Tailwind preset + CSS vars + TS
│   ├── types/              ← shared TS types incl. SeedAnalyzer interface, Supabase generated types
│   └── i18n/               ← en + th translation resources
├── supabase/
│   ├── migrations/         ← 3 migrations: schema, RLS, storage
│   ├── seed.sql            ← reference data
│   └── scripts/            ← seed-users, seed-inspections, RLS smoke
├── docs/
│   ├── handoff/            ← original design-system handoff (preserved)
│   ├── demo-script.md      ← demo day playbook
│   └── HANDOFF.md          ← this file
├── openspec/
│   ├── specs/              ← 9 durable capability specs (35 requirements)
│   └── changes/archive/    ← 2026-04-26-seed-inspector-demo-foundation
├── .github/workflows/      ← ci.yml + deploy-dashboard.yml
└── .npmrc, pnpm-workspace.yaml, …
```

---

## What ships in v0.1.0

### Capabilities (each is a testable spec in `openspec/specs/`)

1. **`project-foundation`** — pnpm monorepo, token pipeline, strict TS, conventional commits (4 reqs)
2. **`supabase-backend`** — schema, RLS, seeded data, storage, generated types (5 reqs)
3. **`authentication`** — email/password sign-in, role-based gating, session persistence (4 reqs)
4. **`inspections-management`** — capture flow, mocked ML, list/detail/per-seed, role-aware delete (6 reqs)
5. **`reference-data-management`** — varieties + batches CRUD, calibration + profiles read-only (4 reqs)
6. **`reporting-and-export`** — filters, KPIs, CSV export with locked column order (3 reqs)
7. **`internationalization`** — EN + TH parity, device-locale default, no raw English in JSX (3 reqs)
8. **`theming`** — light + dark mode, tokens-only (no inline hex), system-following toggle (3 reqs)
9. **`web-dashboard-deployment`** — auto-deploy to GH Pages, 404 SPA fallback, base-path safe (3 reqs)

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

| Item                                                        | Where                                                                                      | Estimated effort          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| Real YOLOv11n integration                                   | swap `MockSeedAnalyzer` for TFLite + CoreML in `apps/mobile/lib/analyzer/`                 | 3–5 days                  |
| Native iOS / Android                                        | regenerate from `docs/handoff/DesignTokens.swift` + `Theme.kt`                             | 4–6 weeks single platform |
| Offline-first sync queue                                    | Mobile only — wire a queue against the sync pill                                           | ~2 weeks                  |
| Calibration capture pipeline                                | LiDAR + ArUco marker live calibration                                                      | ~2 weeks                  |
| Capture error branch                                        | `apps/mobile/app/(tabs)/capture.tsx` lacks an error state on `useCreateInspection` failure | 1 hour                    |
| Migrate `expo-file-system` `/legacy` → new `Paths/File` API | `apps/mobile/app/reports.tsx`                                                              | 1 hour                    |
| Real seed photos                                            | replace branded placeholders in `supabase/seed.sql`                                        | 1 hour                    |

### Total to production beta: **8–12 weeks**

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

# Run dashboard at :5173
pnpm -F @advance-seeds/dashboard dev

# Run mobile via Expo Go
pnpm -F @advance-seeds/mobile start

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

The first change `seed-inspector-demo-foundation` is archived. Future work follows the same pattern.

---

## Decisions worth remembering (full rationale in `openspec/changes/archive/.../design.md`)

- **D1 — Vite over Next.js**: GH Pages is static; we don't need API routes.
- **D2 — Expo over native**: one codebase, both platforms, Expo Go on demo day. Native rebuild is a Phase 2 decision; the design tokens are already shipped for it.
- **D3 — Supabase**: BaaS with Postgres + Auth + Storage + RLS. Free tier covers the demo; self-host is a Docker compose if compliance demands.
- **D4 — `SeedAnalyzer` adapter**: ML lives behind an interface. Mock for demo, real for production, no screen changes between them.
- **D5 — Two roles only**: inspector + admin, enforced in RLS not just UI.

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

_Hand-off authored at v0.1.0. Update this file at every major milestone._

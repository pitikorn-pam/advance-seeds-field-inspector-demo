# Project Hand-off — Advance Seeds Field Inspector Demo

**Status: production-shaped mobile demo (v0.2.0).** Mobile is now a custom dev-client (no longer Expo Go) running on real camera hardware with prototype-faithful navigation, the full three-step capture journey, ROI tools, video recording, snapshots to Photos, and manual calibration. Web dashboard unchanged. ML is still mocked behind the same `SeedAnalyzer` interface — Phase 4 (TFLite) is the next planned uplift.

---

## What's running today

| Surface              | URL / How to run                                                             | Notes                                                                                |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Web dashboard**    | <https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/> | Auto-deploys on every merge to `main` via GitHub Actions                             |
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
│   ├── migrations/         ← 5 migrations: schema, RLS, storage, recordings, inspection metadata
│   ├── seed.sql            ← reference data
│   └── scripts/            ← seed-users, seed-inspections, RLS smoke
├── docs/
│   ├── handoff/            ← original design-system handoff (preserved)
│   ├── demo-script.md      ← demo day playbook
│   └── HANDOFF.md          ← this file
├── openspec/
│   ├── specs/              ← 10 durable capability specs (now incl. mobile-navigation)
│   └── changes/            ← active: mobile-real-usage, prototype-fidelity-pass
├── .github/workflows/      ← ci.yml + deploy-dashboard.yml
└── .npmrc, pnpm-workspace.yaml, …
```

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
9. **`web-dashboard-deployment`** — auto-deploy to GH Pages, 404 SPA fallback, base-path safe (3 reqs)
10. **`mobile-navigation`** — bottom tab bar shape, More menu groupings, three-step capture journey, Home dashboard composition (5 reqs, added by `prototype-fidelity-pass`)

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
| Offline-first sync queue                         | mobile — wire a queue against the sync pill placeholder                             | ~2 weeks         |
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

# Run dashboard at :5173
pnpm -F @advance-seeds/dashboard dev

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

The first change `seed-inspector-demo-foundation` is archived. Future work follows the same pattern.

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

_Hand-off updated at v0.2.0 (2026-04-29). Update this file at every major milestone._

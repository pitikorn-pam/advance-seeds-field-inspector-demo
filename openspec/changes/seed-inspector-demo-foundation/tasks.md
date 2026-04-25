# Tasks — Seed Inspector Demo Foundation

## 1. Repo & Tooling Scaffold

- [x] 1.1 Create `pnpm-workspace.yaml` with `apps/*`, `packages/*` patterns
- [x] 1.2 Root `package.json` with shared scripts: `dev`, `build`, `lint`, `typecheck`, `format`, `supabase:types`, `supabase:seed-users`
- [x] 1.3 Root `tsconfig.base.json` (strict) and per-package `tsconfig.json` extending it
- [x] 1.4 Root ESLint + Prettier config; add format-on-save VS Code settings
- [x] 1.5 Husky + lint-staged for pre-commit lint/format; commitlint for conventional commits
- [x] 1.6 Root `README.md` with quickstart, env setup, demo run instructions
- [x] 1.7 Add `.nvmrc` pinning Node 20.19+ and `engines` in package.json

## 2. Token Pipeline (`packages/tokens`)

- [x] 2.1 Create `packages/tokens` package
- [x] 2.2 Write `build.ts` reading `docs/handoff/design-tokens.json`
- [x] 2.3 Emit `dist/tailwind.preset.cjs` (colors, spacing, radii, fonts mapped from JSON)
- [x] 2.4 Emit `dist/css-vars.css` matching `docs/handoff/design-tokens.css` semantics
- [x] 2.5 Emit `dist/tokens.ts` runtime export
- [x] 2.6 Wire `prepare` script so install always rebuilds tokens
- [x] 2.7 Snapshot test: built CSS matches handoff CSS for every token

## 3. Shared Types & i18n (`packages/types`, `packages/i18n`)

- [x] 3.1 `packages/types`: define `Role`, `Inspection`, `Seed`, `Variety`, `Batch`, `CalibrationProfile`, `AnalysisResult`
- [x] 3.2 Define `SeedAnalyzer` interface with `analyze(image, opts): Promise<AnalysisResult>`
- [x] 3.3 Add Supabase generated types placeholder; `pnpm supabase:types` regenerates
- [x] 3.4 `packages/i18n`: `en/common.json`, `th/common.json`; namespaces per screen group
- [x] 3.5 Translation key linter: forbid raw English strings in `apps/**/*.tsx` outside i18n bundle

## 4. Supabase Backend (`supabase/`)

- [x] 4.1 Install Supabase CLI; `supabase init`
- [x] 4.2 Migration: `profiles` (id FK auth.users, role enum, full_name, locale)
- [x] 4.3 Migration: `varieties` (id, name, scientific_name, description, image_url, created_by, created_at)
- [x] 4.4 Migration: `batches` (id, code, location, sown_at, notes, created_by, created_at)
- [x] 4.5 Migration: `calibration_profiles` (id, name, px_per_mm, source enum lidar/aruco, created_at)
- [x] 4.6 Migration: `inspections` (id, inspector_id FK profiles, variety_id FK, batch_id FK, calibration_id FK, image_url, captured_at, status enum, total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2, notes)
- [x] 4.7 Migration: `seeds` (id, inspection_id FK, index, length_mm, width_mm, area_mm2, grade enum, defects jsonb, bbox jsonb)
- [x] 4.8 Migration: enable RLS on all tables; add policies for inspector vs admin per design D5
- [x] 4.9 Migration: storage bucket `inspection-images` (public read, authenticated write)
- [x] 4.10 `supabase/seed.sql`: 6 varieties, 4 batches, 2 calibration profiles
- [x] 4.11 `supabase/scripts/seed-users.ts`: creates Jane (inspector) and Alex (admin) via service role; idempotent
- [x] 4.12 `supabase/scripts/seed-inspections.ts`: 5 inspections for Jane, 2 for Alex with seeds children and uploaded sample images
- [x] 4.13 RLS smoke test script: sign-in-as-Jane, attempt-read-Alex, expect deny
- [x] 4.14 README in `supabase/` explaining how to apply schema to the live project

## 5. Web Dashboard (`apps/dashboard`)

- [ ] 5.1 Vite + React + TS scaffold with `base: '/advance-seeds-field-inspector-demo/'`
- [ ] 5.2 Tailwind config extending `packages/tokens` preset
- [ ] 5.3 Install shadcn/ui; configure to use token CSS vars
- [ ] 5.4 Supabase client at `src/lib/supabase.ts` reading `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] 5.5 `.env.example` with placeholders; `.env.local` gitignored
- [ ] 5.6 React Router setup with `basename` matching Vite base
- [ ] 5.7 i18n provider (react-i18next) loaded with shared resources
- [ ] 5.8 Theme provider (light/dark) toggling `data-theme` on `<html>`; persists to localStorage
- [ ] 5.9 AuthGate route component; redirects unauthenticated → `/login`
- [ ] 5.10 Login screen (email + password)
- [ ] 5.11 App shell: top bar with sync pill, locale + theme switchers, user menu
- [ ] 5.12 Home screen: KPI tiles, recent inspections list (admin sees all, inspector sees own)
- [ ] 5.13 Inspections list: filter by variety/batch/inspector (admin only)/date range; search; delete
- [ ] 5.14 Inspection detail: per-seed grid, measurements summary, image with overlay placeholder
- [ ] 5.15 Per-seed detail dialog
- [ ] 5.16 Varieties screen: list + create + edit + delete (admin write; inspector read)
- [ ] 5.17 Batches screen: list + create + edit + delete (admin write; inspector read)
- [ ] 5.18 Reports screen: filters + chart placeholder + CSV export button
- [ ] 5.19 Settings screen: locale toggle, theme toggle, profile read-only
- [ ] 5.20 Empty / loading / error states for every primary screen (per HANDOFF rule)
- [ ] 5.21 Manual smoke test checklist run as Jane and Alex

## 6. Mobile App (`apps/mobile`)

- [ ] 6.1 `npx create-expo-app -t default` with TS, RN 0.76 New Architecture
- [ ] 6.2 Install NativeWind; tailwind config consuming `packages/tokens` preset
- [ ] 6.3 Expo Router setup; folder structure per design layout
- [ ] 6.4 Supabase client at `lib/supabase.ts`; AsyncStorage for session
- [ ] 6.5 `.env.example` and Expo `extra` config wiring
- [ ] 6.6 i18n bootstrap with `expo-localization` for default + persisted toggle
- [ ] 6.7 Theme provider using NativeWind dark variants; persists choice
- [ ] 6.8 Auth flow: login screen, session persistence, sign-out
- [ ] 6.9 Bottom tab nav per HANDOFF: Home, Capture, Inspections, Settings
- [ ] 6.10 Home screen with sync pill, "+ New inspection" hero button, recent inspections
- [ ] 6.11 Capture flow: setup → mode → camera shutter → mocked analysis (2s spinner) → results
- [ ] 6.12 `lib/analyzer/MockSeedAnalyzer.ts` returning one of two pre-baked `AnalysisResult`s
- [ ] 6.13 `lib/analyzer/AnalyzerProvider.tsx` exposing `useAnalyzer()`
- [ ] 6.14 Inspections list, inspection detail, per-seed detail
- [ ] 6.15 Varieties screen (admin write, inspector read)
- [ ] 6.16 Batches screen (admin write, inspector read)
- [ ] 6.17 Reports screen with filter sheet + CSV share via `expo-sharing`
- [ ] 6.18 Settings: locale, theme, calibration view (read-only), profile, sign-out
- [ ] 6.19 Calibration screen: shows px/mm value, LiDAR vs ArUco, honest fallback message
- [ ] 6.20 Empty / loading / error states for every primary screen
- [ ] 6.21 Manual smoke test on iOS Expo Go and Android Expo Go as Jane and Alex

## 7. CI / Deploy

- [ ] 7.1 `.github/workflows/ci.yml`: install, lint, typecheck, build all apps on PR
- [ ] 7.2 `.github/workflows/deploy-dashboard.yml`: build dashboard and publish `dist` to `gh-pages` on push to main
- [ ] 7.3 Verify GH Pages URL serves correctly with the configured base path
- [ ] 7.4 Document Expo Go QR distribution in README

## 8. Demo Polish & Dry-run

- [ ] 8.1 Final pass on copy (EN + TH) for all screens
- [ ] 8.2 Verify all screens hit the four states (loaded / empty / loading / error)
- [ ] 8.3 Pre-load Jane and Alex sessions on demo devices; verify role differences are visible
- [ ] 8.4 Record a 60s screen-capture backup video (in case demo wifi fails)
- [ ] 8.5 Stage the demo flow script (the 5 things you'll click)
- [ ] 8.6 Mark `MockSeedAnalyzer` as warned-on-startup in dev mode
- [ ] 8.7 Resolve all four Open Questions in design.md

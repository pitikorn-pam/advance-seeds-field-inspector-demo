# Proposal — Seed Inspector Demo Foundation

## Why

The Advance Seeds presale handoff package ships a polished design system, a static HTML prototype, and platform stubs — but no running application a client can sign in to and use. To win the build phase, we need a working end-to-end demo: a web dashboard the R&D team can browse and a mobile app a field inspector can capture inspections on, both backed by a real database with role-based access and bilingual UI. The demo must look and behave like a finished product even though the ML core is mocked, so the client trusts that the architecture, design, and team are ready for the real build.

## What Changes

- Convert the repo from a static handoff package into a **pnpm monorepo** with `apps/dashboard`, `apps/mobile`, `packages/tokens`, `packages/types`, and `supabase/`.
- Stand up **Supabase** as the shared backend (Postgres + Auth + Storage + RLS) with two seeded users: `jane@advanceseeds.com` (inspector) and `alex@advanceseeds.com` (admin).
- Build the **web dashboard** (Vite + React + TS + Tailwind + shadcn/ui) covering login, home, inspections list/detail, varieties, batches, reports, settings.
- Build the **mobile app** (Expo + RN + TS + NativeWind + Expo Router) covering login, home, capture flow with mocked ML, inspections, per-seed detail, varieties, batches, reports, settings, calibration view.
- Ship **full CRUD** on Inspections, Varieties, Batches; **read-only** on profiles and calibration profiles; CSV export on reports.
- Wire **EN/TH internationalization** and **light/dark theming** from the existing tokens (`docs/handoff/design-tokens.json`).
- Introduce a **`SeedAnalyzer` adapter** (interface + `MockSeedAnalyzer`) so the real YOLOv11n implementation drops in post-demo without screen changes.
- Deploy the dashboard to **GitHub Pages** via Actions; distribute the mobile app via **Expo Go QR** for demo day.

## Capabilities

### New Capabilities
- `project-foundation`: monorepo layout, tooling, token pipeline from JSON to Tailwind/NativeWind, env config for both apps.
- `supabase-backend`: Postgres schema, RLS policies, seeded reference data and demo users, generated TS types.
- `authentication`: email+password sign-in, session persistence, role-based routing in dashboard and mobile.
- `inspections-management`: CRUD for inspections, per-seed measurement views, capture flow with mocked ML adapter.
- `reference-data-management`: CRUD for varieties and batches, read-only views for calibration profiles and user profiles.
- `reporting-and-export`: reports screen with filters and CSV export.
- `internationalization`: EN+TH locale toggle, device-locale default, no hardcoded UI strings.
- `theming`: light/dark mode wired to tokens on both surfaces, with a user toggle.
- `web-dashboard-deployment`: GitHub Pages deploy via Actions, base path configured.

### Modified Capabilities
None — this is the project's first change.

## Impact

- **Code**: New monorepo structure replaces the current flat folder; existing handoff files move to `docs/handoff/` (preserved, not deleted).
- **Dependencies (new)**: pnpm, vite, react, react-router, tailwindcss, shadcn-ui, @tanstack/react-query, @supabase/supabase-js, react-i18next, zustand (web); expo, expo-router, react-native, nativewind, expo-camera, expo-image-picker, expo-localization, i18next (mobile); supabase CLI for migrations and codegen.
- **External services**: Supabase project (URL + anon key already provisioned by the project owner).
- **Infrastructure**: GitHub repository `advance-seeds-field-inspector-demo`, GitHub Actions workflow, GitHub Pages enabled.
- **Out of scope (non-goals)**: Real YOLOv11n inference, on-device camera capture wired to a real model, push notifications, offline-first sync, multi-tenant org structures, payment, App Store / Play Store distribution.

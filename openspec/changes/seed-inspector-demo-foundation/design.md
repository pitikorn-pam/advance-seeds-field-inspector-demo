# Design — Seed Inspector Demo Foundation

## Context

The repo today is a static design-system handoff package: a JSON token file, platform-specific token stubs (SwiftUI, Compose, CSS), a 93KB prototype HTML, and markdown docs. There is no application code, no backend, no auth, no data. The presale demo needs all of that, plus an explicit story for how mocked ML becomes real ML in the build phase. Constraints: GitHub Pages only allows static hosting (no Node runtime), the demo runs on a real Supabase project, and the existing design tokens are the source of truth that all surfaces must respect.

## Goals / Non-Goals

**Goals:**
- One token source (`docs/handoff/design-tokens.json`) drives Tailwind and NativeWind so web and mobile look identical.
- Real CRUD against Postgres with row-level security demonstrates two distinct user experiences (inspector vs admin) without UI-only role faking.
- Mobile capture flow runs as a real screen with real persistence; only the analysis step is mocked.
- An `analyze(image): SeedResult[]` interface seam exists from day one so swapping in YOLOv11n later is additive, not invasive.
- Dashboard ships to GitHub Pages on every merge to `main`; mobile ships via Expo Go QR.
- Bilingual (EN/TH) and theme-aware (light/dark) without retrofit.

**Non-Goals:**
- Real on-device ML inference for the demo.
- Production-grade observability, CI gates beyond build+lint, or load testing.
- Native iOS/Android apps using SwiftUI/Compose directly (the existing `DesignTokens.swift`/`Theme.kt` remain reference for the eventual native build).
- Offline-first sync, conflict resolution, or background uploads.
- App Store / Play Store distribution.

## Decisions

### D1. Web dashboard: Vite SPA over Next.js
GitHub Pages is static-only, which kills Next.js API routes — and we don't need SSR for an internal R&D dashboard. Vite + React + TS gives us the smallest config, fastest dev loop, and a clean SPA artifact for `gh-pages`. **Alternatives considered:** Next.js with `output: 'export'` (heavier, fewer gains); SvelteKit (smaller talent pool for handoff).

### D2. Mobile: Expo (React Native) over native iOS/Android
Single codebase ships to both platforms (matches the original HANDOFF spec). Expo Go QR distribution removes App Store ceremony from demo day. NativeWind mirrors web Tailwind 1:1, so token names stay consistent. **Trade-off:** the existing `DesignTokens.swift` and `Theme.kt` are not used directly — they become reference material for the eventual native build phase, which the handoff doc explicitly reserves for "iOS dev / Android dev." **Alternatives considered:** iOS-only SwiftUI (loses Android, doubles demo distribution friction); Flutter (re-does the design system in a third dialect).

### D3. Backend: Supabase over custom Node + Postgres
BaaS removes the ops burden for a demo and gives us Auth + Storage + RLS + Realtime in a single SDK that works in both the SPA and React Native. The free tier (500 MB DB, 1 GB storage, 50k MAU) is more than enough. **Alternatives considered:** Firebase (NoSQL feels weaker for the relational shape of inspections→seeds); Pocketbase self-hosted (less recognizable to enterprise clients during demo).

### D4. ML adapter pattern
Define a `SeedAnalyzer` interface in `packages/types`:
```
interface SeedAnalyzer {
  analyze(image: ImageRef, opts: AnalyzeOptions): Promise<AnalysisResult>
}
```
Demo ships `MockSeedAnalyzer` (returns one of two pre-baked `AnalysisResult`s after a 2s delay). Build phase adds `TfliteSeedAnalyzer` (via `react-native-fast-tflite`) and optionally `CoreMLSeedAnalyzer` (custom Expo Module). The screen layer never imports a concrete analyzer — it consumes via `useAnalyzer()` hook backed by a context. **Why this matters:** keeps the demo honest about what's mocked and proves the architecture supports the swap.

### D5. Auth & role model
Two roles: `inspector` and `admin`. Stored on `profiles.role` (Postgres enum). RLS policies enforce visibility:
- Inspector: `SELECT/INSERT/UPDATE/DELETE` only where `inspector_id = auth.uid()` on `inspections` and `seeds`; `SELECT` only on `varieties`/`batches`/`calibration_profiles`.
- Admin: full read on everything; full write on `varieties`/`batches`. Cannot delete other inspectors' inspections (avoid demo-day disasters).

### D6. Token pipeline
`packages/tokens/src/build.ts` reads `docs/handoff/design-tokens.json` and emits:
- `packages/tokens/dist/tailwind.preset.cjs` — Tailwind config consumed by both apps.
- `packages/tokens/dist/css-vars.css` — equivalent of `design-tokens.css`.
- `packages/tokens/dist/tokens.ts` — TS object for runtime access (e.g. status pill colors).
Build runs at install via `prepare` script. Single source of truth honored.

### D7. i18n
`react-i18next` on both surfaces, sharing JSON resources at `packages/i18n/{en,th}/*.json`. Mobile uses `expo-localization` to detect default; toggle in Settings persists to AsyncStorage / localStorage. **Lint rule:** custom ESLint rule (or simple grep CI step) blocks raw English strings in JSX outside the i18n bundle.

### D8. Demo seed data
`supabase/seed.sql` inserts:
- 2 users (via `auth.admin` API, scripted in `supabase/scripts/seed-users.ts`).
- 6 varieties (rice, corn, soybean, sunflower, wheat, mung bean — plausible for Thailand).
- 4 batches.
- 5 inspections owned by Jane, 2 by Alex; each with 8–24 child `seeds` rows with realistic measurements.
- 2 calibration profiles.
- Public seed images uploaded to the `inspection-images` bucket.

### D9. Repo and deployment topology
GitHub repo `advance-seeds-field-inspector-demo`. CI workflow:
- On PR: install, lint, typecheck, build all apps.
- On merge to `main`: deploy `apps/dashboard/dist` to `gh-pages` branch via `peaceiris/actions-gh-pages`. Vite `base: '/advance-seeds-field-inspector-demo/'`.
- Mobile: `eas update` channels not used for demo; `npx expo start` + Expo Go QR is the demo distribution.

## File / folder layout

```
03 - Demo/
├── apps/
│   ├── dashboard/
│   │   ├── src/
│   │   │   ├── routes/        ← /, /login, /inspections, /inspections/:id, /varieties, /batches, /reports, /settings
│   │   │   ├── components/
│   │   │   ├── lib/supabase.ts
│   │   │   ├── lib/i18n.ts
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── mobile/
│       ├── app/                ← Expo Router file-based: index.tsx, login.tsx, (tabs)/, inspections/[id].tsx, capture/...
│       ├── components/
│       ├── lib/supabase.ts
│       ├── lib/analyzer/MockSeedAnalyzer.ts
│       ├── lib/i18n.ts
│       ├── app.json
│       └── package.json
├── packages/
│   ├── tokens/                 ← reads docs/handoff/design-tokens.json, emits Tailwind preset + CSS vars + TS
│   ├── types/                  ← shared types incl. SeedAnalyzer interface, Supabase generated types
│   └── i18n/                   ← shared translation JSONs
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── scripts/seed-users.ts
│   └── config.toml
├── docs/handoff/               ← original handoff files (preserved)
├── openspec/
├── .github/workflows/ci.yml
├── .github/workflows/deploy-dashboard.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## Risks / Trade-offs

- **[Wifi flakiness on demo day breaks Supabase calls]** → Pre-load demo screens, keep a recorded video as a backup, optionally switch to a localhost Supabase instance (Docker) before the meeting.
- **[Expo Go SDK version drift on the client's phone]** → Pin Expo SDK in `package.json`; ship a `setup.md` with the exact Expo Go version. Test on both an iPhone and an Android phone before demo.
- **[GitHub Pages base-path breaks routing]** → `BrowserRouter basename` set to the same value as Vite `base`; documented in repo README.
- **[Token pipeline diverges from native Swift/Kotlin stubs]** → JSON remains source of truth; the Swift/Kotlin files in `docs/handoff/` are reference only and explicitly marked stale-OK in the design system doc until the native build phase regenerates them.
- **[RLS misconfiguration leaks one inspector's data to another]** → Add a smoke test in CI that signs in as Jane, attempts to read Alex's row, expects 403/empty.
- **[The `MockSeedAnalyzer` becomes "real enough" and the team forgets to swap it]** → Console-warn at startup in dev: "MockSeedAnalyzer active — replace before production."

## Migration Plan

This is the project's first change — no migration. After merge:
1. Owner creates GitHub repo and pushes `main`.
2. Owner enables GitHub Pages on the `gh-pages` branch.
3. Owner runs `supabase/seed.sql` and `pnpm supabase:seed-users` against the project URL.
4. `pnpm i && pnpm dev` brings up dashboard at `http://localhost:5173` and Expo dev server for mobile.
5. Demo day: open the GH Pages URL and Expo Go QR.

## Resolved Decisions

1. **GitHub Pages URL**: `https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/`. Repo lives at `github.com/phongsakorn-ipassion/advance-seeds-field-inspector-demo`. No vanity domain.
2. **Demo phone**: client brings their own — we hand them an Expo Go QR. Implication: README must include "Install Expo Go from App Store / Play Store, scan QR" instructions; Expo SDK pinned and tested on at least one iPhone and one Android phone before demo.
3. **CSV export columns**: designed freely. v1 column set:
   `id, captured_at, inspector_email, inspector_name, variety, batch_code, batch_location, calibration_source, calibration_px_per_mm, total_seeds, mean_length_mm, mean_width_mm, mean_area_mm2, notes, created_at`.
   Locale of headers follows the user's current i18n locale (EN headers when EN, TH headers when TH).
4. **Storage privacy**: `inspection-images` bucket is **public read**, authenticated write. Object keys are unguessable UUIDs, so URLs aren't trivially enumerable, but content is not protected by auth — acceptable for the demo, flagged for change in build-phase if client requires private storage.

## Open Questions

None at the start of implementation. Reopen this section if new ambiguity surfaces during the apply phase.

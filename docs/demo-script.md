# Demo Day — Flow Script

**Audience.** Client R&D leadership + ML / Engineering stakeholders.
**Duration target.** 12 minutes (5 click-flows + 2 minutes of context + 5 minutes Q&A).
**Devices on the table.** Your laptop (dashboard), the client's iPhone (Expo Go), one Android backup (Expo Go), printed QR card.

---

## Pre-flight (15 minutes before)

- [ ] **Power & Wi-Fi**: laptop on power, joined to venue Wi-Fi or hotspot.
- [ ] **Supabase**: confirm cloud project is reachable — open <https://gqsxiohxokgwwugeoxmy.supabase.co> in a private tab (you should get a 404 page that says "Welcome to Supabase").
- [ ] **Dashboard**: open <https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/> on the laptop. Sign in once as `jane@advanceseeds.com` / `DemoSeeds2026!` so the session is warm. Sign out so Stage 1 is clean.
- [ ] **Mobile**: `pnpm -F @advance-seeds/mobile start` on the laptop. QR appears. Confirm Expo Go on at least one phone can scan it. Have the QR also visible on the laptop screen (or print it on a card).
- [ ] **Backup video**: open the 60-second screen capture (`docs/demo-backup.mp4`) in QuickTime, paused at frame 1, ready to alt-tab to if Wi-Fi flakes.
- [ ] **Browser tabs**: keep open in this order, left to right:
  1. Dashboard (signed-out, login screen showing)
  2. Supabase Studio (table view of `inspections` — for the optional architecture moment)
  3. The OpenSpec change summary (for the optional spec-driven question)
  4. The repo on GitHub (optional, for the architecture credibility moment)
- [ ] **Brand**: company logo / Advance Seeds branding visible on the laptop wallpaper if projected.

---

## Stage 1 — "Here's the inspector experience" (4 min) — MOBILE FIRST

> Why mobile first: it's the marquee differentiator. Hands on a real device beats any screenshot.

### 1.1 Hand the iPhone with Expo Go open

- Have the client scan the QR with the iPhone Camera app (or Expo Go on Android).
- App loads in 5–10 seconds.
- **Talking point**: "This is the same code that ships to the App Store later. We're using Expo Go for the demo so you can try it without provisioning."

### 1.2 Sign in as Jane

- Email pre-filled (`jane@advanceseeds.com`); password `DemoSeeds2026!`.
- **Stop and let the client tap "Sign in" themselves.**
- Land on Home — sync pill, "+ New inspection" hero button, recent inspections list.
- **Talking point**: "The sync pill is always visible. Field inspectors need to trust their work won't be lost; offline-first sync slots in here in production."

### 1.3 Capture flow

Walk the client through:

1. Tap **"+ New inspection"** (the big primary button).
2. Pick variety: **"Rice — Hom Mali"**.
3. Pick batch: **"BATCH-2026-04"**.
4. Pick calibration: **"Default — iPhone 15 Pro LiDAR"** — point out: _"This is honest about which calibration is in use. LiDAR vs ArUco card is a real distinction in production."_
5. Tap shutter.
6. Watch the 2-second analysis progress bar fill.
7. Land on the new inspection's detail.

> **Honesty moment** — say it explicitly: "The analysis you just saw is mocked. The real model is YOLOv11n, exported via Ultralytics to TFLite for both platforms. The mock and the real implementation share the same `SeedAnalyzer` interface, so swapping in the model is additive — no screen changes."

### 1.4 Per-seed detail

- Scroll to the per-seed grid.
- Tap any seed thumbnail.
- Show the per-seed measurement panel (length, width, area, grade).
- **Talking point**: "Per-seed traceability is what separates a measurement tool from a screening tool. Every grain has a row in the database, with its bounding box. This is the ground truth that supports breeding decisions."

### 1.5 Hand the phone back, summary

- "What you just saw is one inspection: a real Postgres row, with a real image in object storage, with 18 child seeds with real geometry. The flow is what an inspector does in the field 50 times a day."

---

## Stage 2 — "Here's what the R&D team sees" (3 min) — DESKTOP

### 2.1 Open the dashboard URL

- <https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-demo/>
- **Talking point**: "Same backend as the phone. The R&D dashboard ships to GitHub Pages on every merge — engineering and the field team are never out of sync."

### 2.2 Sign in as **Alex (admin)**

- `alex@advanceseeds.com` / `DemoSeeds2026!`.
- **Pause**: "Watch what changes between Jane's view and Alex's view."

### 2.3 Inspections list — admin scope

- Land on Home: 7 inspections, ~115 seeds.
- Click **Inspections** in the nav.
- Show the **Inspector** filter — only admins see it.
- Filter by Inspector: Jane → 5 rows. Reset → 7 rows.
- **Talking point**: "RLS at the database enforces this. The UI hides admin actions, and even if a malicious request slipped past the UI, Postgres rejects it."

### 2.4 Reports + CSV export

- Click **Reports**.
- Pick "Last 30 days", variety "Rice — Hom Mali".
- Show the recomputed KPI tiles.
- Click **Export CSV** → file downloads.
- Open the CSV (Numbers / Excel) — **Thai header row stays Thai if the locale is Thai**. (Quick locale flip via the language switcher to demonstrate.)
- **Talking point**: "The export column set is locked in the spec. Your existing R&D Excel templates can ingest this without column mapping."

### 2.5 Variety + batch CRUD

- Click **Varieties**. Show the "+ New variety" button (admin-only).
- Click **Batches**. Show inline edit/delete.
- **Talking point**: "Reference data is admin-managed. Inspectors can read but not write — keeps the catalog clean."

---

## Stage 3 — "Here's the architecture" (2 min) — OPTIONAL, ONLY IF ASKED

> Skip this unless the engineering side of the room asks. Most clients only want stages 1 + 2.

### 3.1 The ML adapter

- Switch to VS Code, open `packages/types/src/analyzer.ts`.
- Show the `SeedAnalyzer` interface.
- "Demo ships `MockSeedAnalyzer`. Production swaps in `TfliteSeedAnalyzer` (cross-platform) or a custom `CoreMLSeedAnalyzer` (iOS Neural Engine). Same JS-facing API."

### 3.2 The spec-driven workflow

- Switch to GitHub.
- Open `openspec/changes/seed-inspector-demo-foundation/`.
- Point at `proposal.md`, `design.md`, `tasks.md`, `specs/`.
- "Every requirement is a testable scenario. The CI validates the spec on every PR. You get an audit trail from intent → contract → code → test."

### 3.3 The token pipeline

- Open `docs/handoff/design-tokens.json`, then `packages/tokens/dist/tailwind.preset.cjs`.
- "One JSON file is the source of truth. The build emits Tailwind config for web, NativeWind preset for mobile, and the original SwiftUI/Compose stubs are preserved for the eventual native rebuild. No drift."

---

## Closing — "What we'd do next" (2 min)

Short, honest, and forward-looking:

1. **Real ML integration**: drop YOLOv11n.tflite into `apps/mobile/assets/`, swap the analyzer provider. Estimated 3–5 days.
2. **Native iOS / Android**: the existing `DesignTokens.swift` and `Theme.kt` reference stubs let us regenerate native screens against the same tokens. Estimated 4–6 weeks for a single-platform native release.
3. **Offline-first sync**: the sync pill is wired but the queue isn't. Estimated 2 weeks for an inspector who can capture without signal.
4. **Calibration capture**: ArUco / LiDAR pipeline production. Estimated 2 weeks.

> Total: **8–12 weeks to a production beta**, depending on platform scope.

---

## Q&A — anticipated questions

| Q                                | A                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Can we run this fully offline?" | "Capture works offline; sync pill flips to amber. Queue + retry is a Phase-2 add — about two weeks."                                                                                    |
| "Where does the data go?"        | "Supabase Postgres in the region you choose. Self-host is a single Docker Compose if compliance demands it."                                                                            |
| "What's the model accuracy?"     | "Honest answer: we don't have YOLOv11n trained on your data yet. The mock returns realistic geometry; once we have your annotated dataset, the same interface picks up the real model." |
| "Why two roles?"                 | "Inspector (field) and admin (R&D). Future roles like 'farm manager' or 'auditor' slot in via Postgres enums; RLS adapts."                                                              |
| "Pricing?"                       | (Sales answers — but the architecture is licensed per inspector seat plus a flat backend.)                                                                                              |
| "How long to a production beta?" | "8–12 weeks scoped to features above; we've already shipped the design system, the data model, the auth + RLS, and the demo."                                                           |

---

## If something breaks

| Failure                            | Recovery                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Wi-Fi flakes during mobile flow    | Switch to the laptop's hotspot; Expo `--tunnel` was tested in pre-flight. Worst case, alt-tab to the backup video. |
| Dashboard URL down                 | Run `pnpm -F dashboard dev` against local Docker Supabase; same flow, slightly different URL.                      |
| Capture flow stalls                | Quit and re-launch Expo Go; the inspection is mocked, no data lost.                                                |
| Client wants to sign in themselves | Use `alex@advanceseeds.com` / `DemoSeeds2026!` for full admin view.                                                |

---

_Last reviewed: pre-demo dry-run. Update after dry-run feedback._

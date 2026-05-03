# Demo Day — Flow Script

**Audience.** Client R&D leadership + ML / Engineering stakeholders.
**Duration target.** 10 minutes (3 stages + 2 minutes of context + 5 minutes Q&A).
**Devices on the table.** Your laptop (Supabase Studio + VS Code), the client's Android phone (pre-installed via Firebase App Distribution), one backup phone, printed QR card (optional, for dev-client install link).

---

## Pre-flight (15 minutes before)

- [ ] **Power & Wi-Fi**: laptop on power, joined to venue Wi-Fi or hotspot.
- [ ] **Supabase**: confirm cloud project is reachable — open <https://gqsxiohxokgwwugeoxmy.supabase.co> in a private tab (you should get a 404 page that says "Welcome to Supabase").
- [ ] **Mobile app installed**: confirm the demo phone has the latest dev-client APK installed via Firebase App Distribution. The latest build is `0.3.0 (1)`. If a fresh install is needed, use the Firebase invite link or the direct APK URL.
- [ ] **Metro running**: `pnpm -F @advance-seeds/mobile start` on the laptop. The dev-client on the phone should connect automatically over LAN.
- [ ] **Backup video**: open the 60-second screen capture (`docs/demo-backup.mp4`) in QuickTime, paused at frame 1, ready to alt-tab to if Wi-Fi flakes.
- [ ] **Browser tabs**: keep open in this order, left to right:
  1. Supabase Studio — table view of `inspections` (<https://supabase.com/dashboard/project/gqsxiohxokgwwugeoxmy/editor>)
  2. The OpenSpec change summary (for the optional spec-driven question)
  3. The repo on GitHub (optional, for the architecture credibility moment)
- [ ] **Brand**: company logo / Advance Seeds branding visible on the laptop wallpaper if projected.

---

## Stage 1 — "Here's the inspector experience" (5 min) — MOBILE

> This is the marquee differentiator. Hands on a real device beats any screenshot.

### 1.1 Hand the phone

- Open the Advance Seeds Field Inspector app (already installed via Firebase).
- App loads in 2–3 seconds.
- **Talking point**: "This is the same code that ships to the Play Store and App Store later. We're using Firebase App Distribution for the demo so you can try it without going through the store."

### 1.2 Sign in as Jane

- Email pre-filled (`jane@advanceseeds.com`); password `DemoSeeds2026!`.
- **Stop and let the client tap "Sign in" themselves.**
- Land on Home — sync pill, "+ New inspection" hero button, recent inspections list.
- **Talking point**: "The sync pill is always visible. Field inspectors need to trust their work won't be lost; offline-first sync slots in here in production."

### 1.3 Capture flow

Walk the client through:

1. Tap **"+ New inspection"** (the big primary button).
2. Pick variety: **"Rice — Hom Mali"** (dropdown search with typeahead).
3. Pick batch: **"BATCH-2026-04"**.
4. Pick calibration: **"Default — iPhone 15 Pro LiDAR"** — point out: _"This is honest about which calibration is in use. LiDAR vs ArUco card is a real distinction in production."_
5. Toggle **Auto-tag location** on — point out: _"GPS is attached to every inspection so field data has provenance."_
6. Tap continue → select **Live** mode.
7. Point the camera at the seed sample.
8. Tap shutter.
9. Watch the analysis progress animation.
10. Land on the new inspection's detail.

> **Honesty moment** — say it explicitly: "The analysis you just saw is mocked. The real model is YOLOv11n, exported via Ultralytics to TFLite for both platforms. The mock and the real implementation share the same `SeedAnalyzer` interface, so swapping in the model is additive — no screen changes."

### 1.4 Per-seed detail

- Scroll to the per-seed grid.
- Tap any seed thumbnail.
- Show the per-seed measurement panel (length, width, area, grade).
- **Talking point**: "Per-seed traceability is what separates a measurement tool from a screening tool. Every grain has a row in the database, with its bounding box. This is the ground truth that supports breeding decisions."

### 1.5 Notifications

- Tap the bell icon next to the role pill on Home.
- Show the notification that the capture was saved.
- **Talking point**: "Inspectors get real-time feedback — save success, upload failures, recording completions. No guessing."

### 1.6 Hand the phone back, summary

- "What you just saw is one inspection: a real Postgres row, with a real image in object storage, with 18 child seeds with real geometry. The flow is what an inspector does in the field 50 times a day."

---

## Stage 2 — "Here's what the data looks like" (2 min) — LAPTOP (Supabase Studio)

> The dashboard was deliberately not built for the demo — the mobile app is the product. But the data is real and queryable.

### 2.1 Show the inspections table

- Switch to Supabase Studio on the laptop (already open).
- Point at the row that was just created from the phone.
- Show the columns: `id`, `variety_id`, `batch_id`, `image_url`, `seed_count`, `metadata` (expand the JSONB — location, ROI shape).
- **Talking point**: "Same backend as the phone. Every inspection is a Postgres row with full relational integrity — foreign keys to varieties and batches, JSONB metadata for flexible fields like GPS and ROI."

### 2.2 Show RLS in action

- Point at the `inspector_id` column.
- **Talking point**: "Row-Level Security at the database enforces who sees what. Jane sees her own work; an admin role sees everyone's. Even if a malicious request slipped past the UI, Postgres rejects it."

### 2.3 Show the seeds table

- Switch to the `seeds` table.
- Filter by the inspection ID just created.
- Show `length_mm`, `width_mm`, `area_mm2`, `grade`, `bbox`.
- **Talking point**: "18 seeds, each with real geometry and a bounding box. This is the dataset your R&D team queries for breeding decisions. The export column set is locked in the spec — your existing Excel templates can ingest it without column mapping."

---

## Stage 3 — "Here's the architecture" (2 min) — OPTIONAL, ONLY IF ASKED

> Skip this unless the engineering side of the room asks. Most clients only want stages 1 + 2.

### 3.1 The ML adapter

- Switch to VS Code, open `packages/types/src/analyzer.ts`.
- Show the `SeedAnalyzer` interface.
- "Demo ships `MockSeedAnalyzer`. Production swaps in `TfliteSeedAnalyzer` (cross-platform) or a custom `CoreMLSeedAnalyzer` (iOS Neural Engine). Same JS-facing API."

### 3.2 The spec-driven workflow

- Switch to GitHub.
- Open `openspec/specs/` — show the list of capability specs.
- Point at any `spec.md`, show the requirements.
- "Every requirement is a testable scenario. The CI validates the spec on every PR. You get an audit trail from intent → contract → code → test."

### 3.3 The token pipeline

- Open `docs/handoff/design-tokens.json`, then `packages/tokens/dist/tailwind.preset.cjs`.
- "One JSON file is the source of truth. The build emits Tailwind config for web, NativeWind preset for mobile, and the original SwiftUI/Compose stubs are preserved for the eventual native rebuild. No drift."

---

## Closing — "What we'd do next" (2 min)

Short, honest, and forward-looking:

1. **Real ML integration**: drop YOLOv11n.tflite into `apps/mobile/assets/`, swap the analyzer provider. Estimated 3–5 days.
2. **Native iOS / Android**: the existing `DesignTokens.swift` and `Theme.kt` reference stubs let us regenerate native screens against the same tokens. Estimated 4–6 weeks for a single-platform native release.
3. **Offline-first sync**: the sync pill is wired and the queue is functional. Estimated 1 week for full production hardening.
4. **Calibration capture**: ArUco / LiDAR pipeline production. Estimated 2 weeks.

> Total: **6–10 weeks to a production beta**, depending on platform scope.

---

## Q&A — anticipated questions

| Q                                | A                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Can we run this fully offline?" | "Capture works offline; sync pill flips to amber. Queue + retry is functional — about one week to production-harden."                                                                   |
| "Where does the data go?"        | "Supabase Postgres in the region you choose. Self-host is a single Docker Compose if compliance demands it."                                                                            |
| "What's the model accuracy?"     | "Honest answer: we don't have YOLOv11n trained on your data yet. The mock returns realistic geometry; once we have your annotated dataset, the same interface picks up the real model." |
| "Why no web dashboard?"          | "Deliberate choice — the inspector's phone is the product. The data is in Postgres with full SQL access; a dashboard is a straightforward add when R&D needs one."                      |
| "Why two roles?"                 | "Inspector (field) and admin (R&D). Future roles like 'farm manager' or 'auditor' slot in via Postgres enums; RLS adapts."                                                              |
| "Pricing?"                       | (Sales answers — but the architecture is licensed per inspector seat plus a flat backend.)                                                                                              |
| "How long to a production beta?" | "6–10 weeks scoped to features above; we've already shipped the design system, the data model, the auth + RLS, and the demo."                                                           |

---

## If something breaks

| Failure                            | Recovery                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Wi-Fi flakes during mobile flow    | Switch to the laptop's hotspot; Metro reconnects automatically. Worst case, alt-tab to the backup video. |
| App crashes or stalls              | Force-quit and re-launch; the inspection is mocked, no data lost.                                        |
| Supabase Studio won't load         | Show the architecture stage instead — the code is the proof, not the console.                            |
| Client wants to sign in themselves | Use `alex@advanceseeds.com` / `DemoSeeds2026!` for full admin view.                                      |

---

_Last reviewed: 2026-05-03, post-dashboard removal. Mobile-only demo._

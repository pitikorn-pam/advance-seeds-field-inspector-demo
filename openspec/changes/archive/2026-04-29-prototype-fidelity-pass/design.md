# Design — Prototype Fidelity Pass

## Context

`mobile-real-usage` over-rotated on capture-flow visual fidelity and under-specified the rest of the app. The prototype's structural choices — tab arrangement, screen hierarchy, dashboard composition — were never enforced. Spec scenarios pass; the app's shape doesn't match the artifact stakeholders signed off on.

This change is *only* about structure and arrangement. No behavior changes; every existing scenario in `inspections-management`, `reference-data-management`, `authentication`, etc. continues to pass.

## Decisions

### D1. Tab bar: Home / Camera / Library / More — not the prototype's literal Home / History / Library / Profile

The prototype's bar is correct for an app where Profile *is* the secondary-navigation hub (Settings lives inside it). Our app has more breadth — Reports, Batches, Calibration, Recordings — that a single Profile tab can't comfortably absorb without nested navigation that hurts discoverability.

**Adaptation**:
- **Home** — dashboard with hero + recent list. Same role as prototype.
- **Camera** — direct entry to `/capture/setup`. Replaces the prototype's "tap CTA on Home." Reasoning: capture is *the* primary action; a tab puts it one tap away from anywhere.
- **Library** — varieties + reference data. Same as prototype.
- **More** — three-dots / "donut" overflow icon. Hosts everything else: History, Profile, Settings, Recordings, Reports, Batches, Calibration. Replaces the prototype's Profile tab.

Trade-off: a user looking for History needs two taps (More → History) instead of one. Acceptable because History is consultative, not action-driving.

### D2. Capture flow: Setup → Mode → Scan/Precise (3 steps as in prototype)

Today: one screen does everything (variety + batch + calibration + mode + start). Prototype: two screens (setup metadata, then mode pick).

The split makes sense because mode choice is a different cognitive task from metadata entry. Mixing them on one screen invites users to thrash on mode toggles while filling in batch IDs.

- `/capture/setup` — variety selector (taps to open Library in selection mode), batch / lot ID input, notes textarea, auto-tag location toggle. Continue routes to `/capture/mode`.
- `/capture/mode` — Live scan vs Precise capture as bordered cards with descriptions + tag pills. Tapping a card routes to that mode's screen.

Calibration is dropped from the setup screen entirely — calibration profile selection moves to a Settings-side workflow (later). For Phase 5 LiveCalibrator output, the calibration ID field on inspections becomes optional.

### D3. Variety selector opens Library in selection mode

Prototype's setup screen has a button that says "Corn — Hybrid Yellow Y28 / 11.0 × 4.5 mm reference". Tapping it opens the Library. We mirror this:

- Library accepts a `?select=variety` query param.
- When present, tapping a variety row dismisses Library back to setup with the chosen variety on the capture session.
- When absent, Library is browse-mode (the existing CRUD).

This saves us from building a separate variety picker UI and reuses the polished Library.

### D4. Home dashboard composition

The hero card on Home is **today's running totals**, not all-time stats. Specifically:

- Total seeds inspected today (count of seeds across today's inspections).
- Today's batches inspected (distinct batch_id over today's rows).
- Today's % Grade A.

A small sparkline shows the per-hour seed count distribution across today, giving a sense of pace. If today has zero inspections, the hero shows yesterday's recap with a "Today: 0" overlay.

Recent list is the three most recent inspections, each row showing variety-tinted thumb (corn=amber, rice=green, legume=teal, mungbean=coral) with the seed count number, name, "{{relative_time}} · {{mm}} avg · {{pct}}% A", chevron. Tap routes to detail.

Sync banner is `<Pill>` with green/dot for "Up to date" or amber/dot for "{{N}} pending" (placeholder for the eventual sync queue feature).

### D5. More screen as a sectioned menu

Sections are semantic groupings, not random lists. From top:

```
Manage
  Profile             →  /profile
  Recordings          →  /more/recordings (a new screen)
  Sign out            →  destructive action

Reference
  Batches             →  /batches
  Calibration         →  /calibration

Insights
  History             →  /more/history (the renamed inspections list)
  Reports             →  /reports

App
  Settings            →  /settings
  About               →  /about (placeholder)
```

The order is tuned to access frequency: Profile/Recordings most likely, Reports/Settings rare.

### D6. Library segmentation by family

Prototype groups varieties by family ("Corn varieties", "Rice varieties", "Legume varieties") with a segmented filter at the top (All / Corn / Rice / Legumes).

Family is derived from `variety.color_key` which already exists (corn/rice/legume/mungbean). Filter is local React state; segmented control reuses the existing `Segmented` (or we build a small one). Section headers use the existing `meta` typography. Empty families collapse silently.

### D7. History polish under /more/history

The prototype's History tab has filters (All / Today / Synced / Pending) and date grouping. We render these on the route formerly known as `/inspections.tsx` (or wherever the list ends up — likely `/more/history.tsx`):

- Segmented filter — All is default; Today filters to `captured_at >= today_00:00`; Synced and Pending are placeholders (everything is "synced" right now since we don't have an offline queue).
- Date grouping — render rows under "Today · {{N}} inspections", "Yesterday · {{N}}", "Earlier this week", "Earlier".
- Per-row sync status pill — "Synced" (green) for now, "Pending" reserved.

### D8. Don't migrate the route filenames more than once

Restructuring tab files involves git renames. We do them all in commit #1 to keep history clean. Routes that move:

- `apps/mobile/app/(tabs)/capture.tsx` → deleted (Camera tab points directly at `/capture/setup`).
- `apps/mobile/app/(tabs)/inspections.tsx` → moved to `apps/mobile/app/more/history.tsx`.
- `apps/mobile/app/(tabs)/settings.tsx` → moved to `apps/mobile/app/settings.tsx` (top-level non-tab).
- `apps/mobile/app/profile.tsx` → moved to `apps/mobile/app/(tabs)/profile.tsx` if we keep the prototype-literal interpretation, else stays at `apps/mobile/app/profile.tsx` and is reached via More. **Decision**: keep at `/profile` (non-tab) since More is the navigation hub.
- `apps/mobile/app/varieties/index.tsx` → moved to `apps/mobile/app/(tabs)/library.tsx` (the index becomes the Library tab landing). Detail at `/varieties/[id].tsx` stays.

## Risks / Trade-offs

- **[Tab change is jarring for existing users]** → none in production yet; demo personas don't have preference state. Acceptable.
- **[More menu hides discoverability]** → mitigated by the section grouping and the fact that 80% of usage is Home + Camera + Library anyway.
- **[Variety selector via Library is slower than a dropdown]** → 1–2 extra taps but reuses the polished Library; trade-off lands on the side of less code.
- **[Capture flow split adds a screen]** → more taps, but cleaner mental model. Demo flow is "tap Camera → fill setup → pick mode → shoot" which is one extra tap vs today.
- **[History route move breaks any deep links to /inspections]** → no production traffic; internal-only. Routes still exist for `/inspections/[id]`.

## Migration Plan

Sequenced commits:

1. `feat(mobile): tab bar restructure (Home / Camera / Library / More)` — minimal More screen, route moves. After this commit the app is internally inconsistent (no Home rebuild yet) but every screen is reachable.
2. `feat(mobile): More screen sections` — proper layout with Manage / Reference / Insights / App.
3. `feat(mobile): split capture into setup + mode` — new Mode screen, simplified Setup, variety selector via Library.
4. `feat(mobile): Home dashboard rebuild` — hero card + recent list + sync banner.
5. `feat(mobile): Library segmentation` — family filter + grouped sections.
6. `feat(mobile): History polish` — segmented filter + date grouping + sync pills. *(optional; lowest priority)*

Each commit is independently reviewable and reversible. After commit #1, the app already passes every behavioral spec; subsequent commits are progressively-better visual fidelity.

## Open Questions

- **Auto-tag location toggle behavior** — toggle exists in the prototype but no actual geolocation capture. **Resolved**: ship as a UI-only toggle that records the value in `inspection.metadata.location_capture_enabled` for now; real `expo-location` wiring is a follow-up that needs another native dep.
- **Sparkline data** — do we have hour-by-hour aggregates? **Resolved**: derive client-side from today's inspections grouped by `captured_at` hour. Slow with thousands of rows, but our demo dataset is < 50 rows; revisit when scale matters.
- **Recordings sub-route under More** — does it deserve a top-level entry or stay nested in Profile? **Resolved**: move to `/more/recordings` as a top-level entry under Manage. The current Profile screen drops the recordings list; Profile becomes a pure profile screen (avatar + stats + sign out).

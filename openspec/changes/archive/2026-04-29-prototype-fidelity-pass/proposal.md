# Proposal — Prototype Fidelity Pass

## Why

`mobile-real-usage` was scoped to capture-flow visual fidelity (live viewfinder, precise mode, processing, review, seed detail). It explicitly added five missing screens (splash, welcome, seed detail, variety detail, profile) but did not re-evaluate the rest of the app against `docs/handoff/prototype.html`.

The result: every behavioral spec passes — Jane can sign in, capture, save, list, drill in — but the app's *structural* fidelity to the prototype is roughly 50%. Specifically:

- Bottom tab bar is **Home / Capture / Inspections / Settings**; prototype is structured around Home / History / Library / Profile.
- Home is a generic stat list; prototype is a hero card + recent list with colored thumbs + a sync banner.
- Capture is a single-screen Setup-with-mode-picker; prototype splits Setup → Mode → Scan/Precise.
- Library (varieties) is a flat list reached via Settings; prototype makes it a top-level destination with family-segmented sections.
- History is a flat reverse-chron list; prototype groups by date with per-row sync pills and a segmented filter.
- Profile and Settings are inverted — prototype makes Profile a tab with Settings inside it; we did the opposite.

These are real divergences a stakeholder walking the demo will notice. They were never caught because the proposal under-specified prototype fidelity outside the capture flow.

## What Changes

### Tab bar restructure — the foundational move
Bottom tabs become **Home · Camera · Library · More**. This is a pragmatic adaptation of the prototype's Home/History/Library/Profile rather than a literal copy:
- **Home** stays — it's the dashboard.
- **Camera** elevates the primary user action (capture) to a tab. The prototype routes capture from Home's CTA; we want a dedicated tab so users can launch capture from anywhere with one tap.
- **Library** becomes a top-level tab — varieties + reference data are a frequent destination, not buried under Settings.
- **More** is a meatballs/donut menu (the three-dots overflow icon) that holds every secondary destination: History (inspections list), Profile, Settings, Recordings, Reports, Batches, Calibration. This is cleaner than the prototype's literal Profile-as-tab pattern for an app with our breadth of admin screens.

### Capture flow split
Today's `/capture/setup` collapses variety + batch + calibration + mode into one screen with a "Start capture" button. Prototype splits these into two screens:

- `/capture/setup` — variety selector (chooses, doesn't list), batch / lot ID input, notes textarea, auto-tag location toggle, Continue.
- `/capture/mode` — Live scan vs Precise capture cards with descriptions and tag pills.
- Then onward to `/capture/scan` or `/capture/precise` as today.

The Live and Precise screens themselves keep all their current Phase 6/7/7b functionality (KPI strip, ROI tools, recording, snapshot, flash with torch bracket, etc.).

### Home screen rebuild
- Greeting line ("Hello, {{first_name}}" + today's date).
- Brand-deep hero card with today's KPIs (total seeds, % Grade A) and a small sparkline.
- Big primary CTA: "+ New inspection" (height 56 px) routing into `/capture/setup`.
- "Recent" section header with "View all" link to History.
- Recent inspections card — three rows max, colored thumbs (variety-tinted background) showing seed count, name, "{{when}} · {{mm}} avg · {{pct}}% A", chevron.
- Sync status banner at the bottom.

### Library polish
- Segmented filter by family (All / Corn / Rice / Legumes / etc.).
- Sections grouped by family with `meta` header rows ("Corn varieties", "Rice varieties").
- Variety rows: colored thumb with first letter, name, "{{ref_l}} × {{ref_w}} mm · ±{{tol}} tolerance", chevron.

### History polish (under /more/history)
- Segmented filter (All / Today / Synced / Pending).
- Date-grouped sections ("Today · 3 inspections", "Yesterday · 8 inspections").
- Per-row sync status pill (Synced / Pending).

### More screen
- New top-level destination at `/more` (and tab entry).
- Three sections, each a Card with list rows + chevrons:
  - **Manage**: Profile, Recordings, Sign out.
  - **Reference**: Batches, Calibration profiles.
  - **Insights**: History (inspections), Reports.
  - **App**: Settings.
- Tapping any row routes to the existing screen.

### Out of scope (carried forward from `mobile-real-usage` or beyond)
- Phase 4 TFLite analyzer, Phase 5 calibration native modules, Phase 11 iOS distribution remain as-is.
- Live/Precise camera screens themselves are untouched (they already passed the Phase 6+7+7b fidelity bar).
- Inspection detail layout (histogram, sort, action bar) — deferred. The screen works; tightening the visual layout is a polish follow-up.

## Capabilities

### New Capabilities
- `mobile-navigation`: tab bar layout, More-screen destinations, capture-flow routing, Home dashboard structure.

### Modified Capabilities
- `inspections-management`: capture-flow scenario gains a Mode-picker step between Setup and Scan/Precise.
- `reference-data-management`: Library (varieties) is now a top-level tab destination with family segmentation.

## Impact

- **Code**: tab layout file rewritten; new `/more` route + screen; new `/capture/mode` route; `/capture/setup` simplified; `/inspections.tsx` tab removed (the list moves under `/more/history`); new Home layout; Library segmentation.
- **Specs**: one new `mobile-navigation` capability; modified scenarios on `inspections-management` (3-step capture); modified scenarios on `reference-data-management` (Library is a tab).
- **Tests**: i18n parity gains new keys (More menu entries, segmented filter labels, hero KPIs); typecheck unchanged.
- **Migrations**: none.
- **Native rebuild**: not required. Pure JS.
- **Risk**: Tab restructure invalidates existing user mental models. Demo accounts in the wild (Jane, Alex) have no preference state so the change is invisible to them; for any QA build with a deep-linked URL, those URLs are unchanged (`/inspections/[id]`, `/varieties/[id]`, etc. still work, just reached differently).

## Migration Plan

Six commits in dependency order so each lands cleanly:

1. **Tab restructure** — `Home / Camera / Library / More` plus a stub More screen. App still works; Settings/History temporarily reachable via the More menu only.
2. **More screen rebuild** — proper sections (Manage / Reference / Insights / App).
3. **Capture flow split** — new Mode picker; Setup simplified; Home CTA routes through both.
4. **Home rebuild** — hero card, recent list, sync banner.
5. **Library segmentation** — family filter, grouped sections.
6. **History polish** (optional follow-up) — segmented filter, date grouping, sync pills.

After all six, every behavioral spec scenario still passes (verified via existing scenarios) and the structural prototype fidelity is ≥ 90%.

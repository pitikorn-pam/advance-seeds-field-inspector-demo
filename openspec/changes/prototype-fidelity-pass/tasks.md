# Tasks — Prototype Fidelity Pass

## 1. Tab bar restructure (foundation)

- [ ] 1.1 Replace `apps/mobile/app/(tabs)/_layout.tsx` tabs with Home / Camera / Library / More, with the More tab using a `MoreHorizontal` (donut) icon
- [ ] 1.2 Delete `apps/mobile/app/(tabs)/capture.tsx` (Camera tab routes directly to `/capture/setup` via `Tabs.Screen` href)
- [ ] 1.3 Move `apps/mobile/app/(tabs)/inspections.tsx` → `apps/mobile/app/more/history.tsx`. Strip the tab-frame styling; treat it as a sub-screen of More.
- [ ] 1.4 Move `apps/mobile/app/(tabs)/settings.tsx` → `apps/mobile/app/settings.tsx`. Update `_layout.tsx` to register it as a non-tab route with header.
- [ ] 1.5 Move `apps/mobile/app/varieties/index.tsx` → `apps/mobile/app/(tabs)/library.tsx`. Variety detail at `/varieties/[id].tsx` stays.
- [ ] 1.6 Add `apps/mobile/app/(tabs)/more.tsx` — minimal sectioned menu (just rows in this commit, polish later).
- [ ] 1.7 Update `_layout.tsx` to register the new routes (More tab, settings, more/history, more/recordings stubs).
- [ ] 1.8 Smoke-test every existing route is still reachable: walk Home → Capture (via tab) → Library (via tab) → More → each row.

## 2. More screen sections

- [ ] 2.1 `apps/mobile/app/(tabs)/more.tsx` rebuilds with sections: Manage / Reference / Insights / App.
- [ ] 2.2 Each section uses `<Card className="p-0">` with stacked `MenuRow`s separated by 0.5px dividers (mirror the existing settings list).
- [ ] 2.3 Rows: Profile / Recordings / Sign out (Manage); Batches / Calibration (Reference); History / Reports (Insights); Settings / About (App).
- [ ] 2.4 Sign out row mirrors the existing Profile sign-out logic (router.replace("/login") after signOut).
- [ ] 2.5 i18n: `more.sections.{manage,reference,insights,app}` + `more.menu.{profile,recordings,signOut,batches,calibration,history,reports,settings,about}` (en + th, parity green).
- [ ] 2.6 New `apps/mobile/app/more/recordings.tsx` — pulls the recordings list from the existing profile screen into its own route. Profile screen drops the recordings list.

## 3. Capture flow split

- [ ] 3.1 New `apps/mobile/app/capture/mode.tsx` — Live scan vs Precise capture as bordered cards. Live: tinted-red icon + "Fast" / "No calibration" pills. Precise: brand-bordered + "Lab grade" badge + "Accurate" / "Slower" pills.
- [ ] 3.2 Refactor `apps/mobile/app/capture/setup.tsx` — drop the inline mode picker, drop the calibration buttons. Keep variety selector (now opens Library in selection mode), batch input, notes textarea. Add auto-tag location toggle (UI-only). Continue button routes to `/capture/mode`.
- [ ] 3.3 Variety selector wires to `/capture/library?select=variety` (a new transient route OR a query param on the existing Library tab — see D3).
- [ ] 3.4 `apps/mobile/app/(tabs)/library.tsx` honours `?select=variety` — tap a variety dismisses to setup with `varietyId` set on session.
- [ ] 3.5 i18n: `capture.setup.{varietyHint,batchHint,notesHint,autoTagTitle,autoTagSubtitle,continue}` + `capture.mode.{title,subtitle,liveTitle,liveBody,liveTagFast,liveTagNoCalib,preciseTitle,preciseBody,preciseTagAccurate,preciseTagSlower,preciseLabGrade}` (en + th).
- [ ] 3.6 Capture session adds `notes: string | null` and `locationTagEnabled: boolean` fields.
- [ ] 3.7 Save flow (review.tsx onSave) writes `{ ...metadata, location_capture_enabled, notes }` into the inspection metadata (extends the Phase 6b.8 metadata bag).
- [ ] 3.8 Wire Camera tab → `/capture/setup` via `Tabs.Screen` redirect.

## 4. Home dashboard rebuild

- [ ] 4.1 New `apps/mobile/app/(tabs)/index.tsx` layout. Sections: greeting, hero card, primary CTA, recent list, sync banner.
- [ ] 4.2 `components/home/HeroCard.tsx` — brand-deep background, today's KPIs (total seeds, % Grade A, batches), small SVG sparkline derived from per-hour seed-count of today's inspections.
- [ ] 4.3 `components/home/RecentInspections.tsx` — three rows max, variety-tinted thumb (color_key → bg/text), seed count as the thumb label, "{{relative}} · {{mm}} avg · {{pct}}% A" caption.
- [ ] 4.4 `components/home/SyncBanner.tsx` — green pill "All inspections synced" / "Last sync · {{when}}". Pure UI; sync queue is a future feature.
- [ ] 4.5 i18n: `home.{greeting,today,allSynced,lastSync,viewAll,recent,heroLabel,heroSubtitle,heroSubtitleEmpty}` (en + th).
- [ ] 4.6 Greeting uses `profile.full_name` first-token only ("Hello, Jane") and a localized weekday + day ("Saturday, 25 April").

## 5. Library segmentation

- [ ] 5.1 `apps/mobile/app/(tabs)/library.tsx` (formerly varieties/index.tsx) wraps the data in a Segmented control: All / Corn / Rice / Legumes / Mungbean.
- [ ] 5.2 `components/ui/Segmented.tsx` — small horizontal segmented control, shared with future use cases.
- [ ] 5.3 Group rows by `color_key` (corn/rice/legume/mungbean) into sections with `meta` headers ("Corn varieties", "Rice varieties").
- [ ] 5.4 Each row uses a colored thumb (variety token bg + text) showing the variety's first letter, name, "{{ref_l}} × {{ref_w}} mm · ±{{tol}} tolerance" caption, chevron. Tap routes to `/varieties/[id]` unless `?select=variety` is set (then dismisses).
- [ ] 5.5 i18n: `library.{title,segments.{all,corn,rice,legume,mungbean},sections.{corn,rice,legume,mungbean}}` (en + th).
- [ ] 5.6 Reference dimensions (`{{ref_l}} × {{ref_w}} mm`) — derived from the variety's recent-inspections mean since the schema doesn't yet store reference values. Mark with a small "(observed)" qualifier.

## 6. History polish (deferrable)

- [ ] 6.1 `apps/mobile/app/more/history.tsx` adds a Segmented control: All / Today / Synced / Pending.
- [ ] 6.2 Group rows by date: Today / Yesterday / Earlier this week / Earlier (each as a section with a "{{label}} · {{N}} inspections" header).
- [ ] 6.3 Per-row sync pill — green "Synced" by default. "Pending" branch reserved for the offline queue feature.
- [ ] 6.4 i18n: `history.{title,segments.{all,today,synced,pending},groups.{today,yesterday,earlierThisWeek,earlier},syncStatus.{synced,pending}}` (en + th).

## 7. Spec deltas

- [ ] 7.1 New capability `mobile-navigation` — see `specs/mobile-navigation/spec.md` (added in this change).
- [ ] 7.2 Modified `inspections-management` — capture-flow scenario gains a Mode-picker step. See `specs/inspections-management/spec.md` (delta).
- [ ] 7.3 `openspec validate prototype-fidelity-pass` passes.

## 8. QA

- [ ] 8.1 Walk every navigation path on iOS (clean clone build): Home → Camera tab → setup → mode → scan/precise → shutter → processing → review → save. Then Home → recent list row → detail → seed detail.
- [ ] 8.2 Walk More → every row → expected screen renders → back button returns to More.
- [ ] 8.3 Library: segment between All / Corn / Rice → grouped sections render correctly. Tap a variety → detail. From Capture's variety selector, tap a variety → returns to setup with selection.
- [ ] 8.4 i18n parity test green; typecheck + lint green; existing tests still pass.
- [ ] 8.5 Tag commit hashes in `tasks.md` ticks for traceability.

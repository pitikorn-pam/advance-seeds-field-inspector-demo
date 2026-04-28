# Tasks — Prototype Fidelity Pass

## 1. Tab bar restructure (foundation)

- [x] 1.1 Replace `(tabs)/_layout.tsx` tabs with Home / Camera / Library / More — `MoreHorizontal` icon for the More tab.
- [x] 1.2 Renamed `(tabs)/capture.tsx` → `(tabs)/camera.tsx` (kept the redirect-to-`/capture/setup` pattern; component renamed to `CameraTab`).
- [x] 1.3 Moved `(tabs)/inspections.tsx` → `more/history.tsx`. Component renamed to `HistoryScreen`; SafeAreaView edges flipped from `top` (tab landing) to `bottom` (sub-screen with header).
- [x] 1.4 Moved `(tabs)/settings.tsx` → `app/settings.tsx`. SafeAreaView edges adjusted for non-tab use; the "Varieties" link in its menu updated to point at `/library` instead of the removed `/varieties` route.
- [x] 1.5 Moved `varieties/index.tsx` → `(tabs)/library.tsx`. Variety detail at `/varieties/[id].tsx` stays.
- [x] 1.6 Added `(tabs)/more.tsx` with the four sections (Manage / Reference / Insights / App) and stub MenuRow components. New `more/recordings.tsx` route created so Recordings can move out of `/profile` later.
- [x] 1.7 Root `_layout.tsx` updated: registered `settings`, `more/history`, `more/recordings`. Removed the orphaned `varieties` Stack.Screen entry. New i18n namespace `more` (en + th) registered in `packages/i18n/src/{en,th}/index.ts` + `namespaces` array.
- [x] 1.8 Typecheck + lint + i18n parity green. Smoke walk deferred to user — we now have the structural plumbing and Metro/iOS testing happens next.

## 2. More screen sections

- [x] 2.1 `(tabs)/more.tsx` shipped with all four sections — Manage / Reference / Insights / App — landed in the Phase 1 commit since the section structure was straightforward.
- [x] 2.2 Each section uses `<Card className="p-0">` + stacked `MenuRow`s + 0.5 px `Divider`s (`bg-line-tertiary mx-lg`).
- [x] 2.3 Rows in place: Profile / Recordings / Sign out (Manage); Batches / Calibration (Reference); History / Reports (Insights); Settings / About (App).
- [x] 2.4 Sign out wraps the existing `useAuth().signOut` + `router.replace("/login")`, gated by an Alert confirmation.
- [x] 2.5 i18n: `more.{title,sections,menu}` (en + th) registered in `packages/i18n/src/{en,th}/index.ts` + `namespaces` array.
- [x] 2.6 `more/recordings.tsx` ships the recordings list as a standalone route. Profile retains its inline list for now; Phase 4 (Home rebuild) is when Profile gets simplified.

## 3. Capture flow split

- [x] 3.1 `app/capture/mode.tsx` ships with two bordered cards — Live scan (red icon + Fast/No-calibration pills) and Precise capture (brand-bordered, "Lab grade" badge, Accurate/Slower pills).
- [x] 3.2 `app/capture/setup.tsx` refactored: drops the inline mode picker and calibration section; keeps variety selector (opens variety-picker), keeps batch button list (admin-write RLS makes free-form batch input awkward — deferred), adds notes textarea, adds auto-tag location toggle. Continue → `/capture/mode`.
- [x] 3.3 Variety selector wires to a dedicated `app/capture/variety-picker.tsx` route — chosen over `?select=variety` on the Library tab so the dismiss target is unambiguous and a stray tab tap can't strand the user (D3).
- [x] 3.4 N/A — superseded by 3.3. Library tab stays in browse-mode for everyone; selection happens in the dedicated picker route.
- [x] 3.5 i18n: `capture.setupSubtitle`, `capture.varietyPlaceholder`, `capture.notesLabel`, `capture.notesOptional`, `capture.notesPlaceholder`, `capture.autoTagTitle`, `capture.autoTagSubtitle`, `capture.modePicker.{subtitle,liveSubtitle,liveBody,preciseSubtitle,preciseBody,preciseLabGrade,tagFast,tagNoCalib,tagAccurate,tagSlower}` — en + th, parity green.
- [x] 3.6 Capture session adds `notes: string` and `locationTagEnabled: boolean` fields with `""`/`false` defaults; both reset in `session.reset()`.
- [x] 3.7 review.tsx onSave writes `notes` to the inspection's `notes` column and extends the metadata bag with `location_capture_enabled` when the toggle was on. ROI keeps its existing key in metadata.
- [x] 3.8 Camera tab (renamed Inspect in Phase 1's polish) routes to `/capture/setup` via the existing `useFocusEffect` redirect in `(tabs)/camera.tsx`.

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

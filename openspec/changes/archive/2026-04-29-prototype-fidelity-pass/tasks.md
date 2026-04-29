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

- [x] 4.1 New `(tabs)/index.tsx` composes greeting + hero card + primary CTA + recent list (or empty state) + sync banner.
- [x] 4.2 `components/home/HeroCard.tsx` — brand-deep background (#04342C) with today's total seeds as the headline number, "{N} seeds across {M} batches" sub-caption, decorative SVG sparkline. Empty state ("Today: 0") falls back to encouragement copy. % Grade A intentionally omitted from the hero — it would require a per-grade aggregation query (Supabase RPC or all-seeds-fetch); deferred until that infrastructure lands.
- [x] 4.3 `components/home/RecentInspections.tsx` — up to 3 most recent rows with variety-tinted thumbs (corn=amber, rice=green, legume=teal, mungbean=coral), seed count as thumb label, "{relative} · {mm} mm avg" caption. "View all" link routes to /more/history.
- [x] 4.4 `components/home/SyncBanner.tsx` — green-check pill anchored at bottom. Always shows "Up to date" for v0.2.
- [x] 4.5 i18n: `home.{greeting,heroLabel,heroSubtitle,heroSubtitleEmpty,recent,viewAll,allSynced,lastSync,now}` (en + th, parity green).
- [x] 4.6 Greeting uses `profile.full_name` first-token only ("Hello, Jane") and a localized weekday + day ("Wednesday, 29 April") via Intl.DateTimeFormat.

## 5. Library segmentation

- [x] 5.1 `(tabs)/library.tsx` wraps the data in a horizontal segmented control: All / Corn / Rice / Legumes / Mungbean.
- [x] 5.2 `components/ui/Segmented.tsx` — generic horizontal segmented control with `scrollable` opt-in. Reusable; History (Phase 6) reuses it.
- [x] 5.3 Rows grouped by `color_key` into sections with caption-typography headers ("Corn varieties", etc.). Empty families collapse silently.
- [x] 5.4 Each row uses a colored thumb (variety token bg + fg) showing the first letter of the variety name, name, dimension caption, chevron. Tap routes to `/varieties/[id]`. Variety-selection mode (the prototype's `?select=variety` pattern) lives in the dedicated `/capture/variety-picker` route from Phase 3 instead.
- [x] 5.5 i18n: `library.{title,segments.*,sections.*,dimensionsObserved,dimensionsPending}` (en + th, parity green).
- [x] 5.6 Reference dimensions are observed averages from `useInspections` data — caption marked "observed" so demo viewers don't mistake derived means for spec values. Future migration can add `reference_length_mm` / `reference_width_mm` and the row will auto-prefer those.

## 6. History polish

- [x] 6.1 `more/history.tsx` adds a horizontal Segmented control: All / Today / Synced / Pending. Pending branch returns empty until the offline queue lands.
- [x] 6.2 Rows grouped by date: Today / Yesterday / Earlier this week / Earlier — each section has a "{{label}} · {{N}} inspections" header.
- [x] 6.3 Per-row sync pill — green "Synced" pill rendering on every row today; "Pending" reserved.
- [x] 6.4 i18n: `history.{title,segments,groups,syncStatus}` (en + th, parity green).

## 7. Spec deltas

- [x] 7.1 New `mobile-navigation` capability shipped in `f813a0c` — 5 requirements (tab bar / More menu / capture entry / 3-step flow / variety picker / Home composition).
- [x] 7.2 Modified `inspections-management` — `f813a0c` adds the 3-step capture scenario; existing scenarios untouched.
- [x] 7.3 `openspec validate prototype-fidelity-pass` is valid (verified post-Phase-1).

## 8. QA

- [x] 8.1 Walk every navigation path on iOS — confirmed passing on iPhone Air (v0.2.0).
- [x] 8.2 More → every row → back returns cleanly without "(tabs)" leak — confirmed.
- [x] 8.3 Library segmentation + variety detail + Start inspection flow — confirmed.
- [x] 8.4 i18n parity test green (`pnpm -F @advance-seeds/i18n test`); typecheck + lint green across the workspace.
- [x] 8.5 Commit hashes recorded in tasks.md ticks: `c45a209` (Phase 1), `a9bb278` (Phase 2 tick), `207e5b7` (Phase 3), `bfff364` (Phase 4), `e135670` (Phase 5).

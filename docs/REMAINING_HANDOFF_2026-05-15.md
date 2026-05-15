# Remaining handoff — 2026-05-15

Supersedes [`docs/REMAINING_HANDOFF_2026-05-04.md`](./REMAINING_HANDOFF_2026-05-04.md). Captures a UI-polish + bugfix session covering the Journey 14 Model Registry port, several cross-app design-cleanup tasks, and one real reinstall-blocks-inspection bug.

All shipped changes pass `pnpm -F @advance-seeds/mobile typecheck`. Nothing committed yet — the working tree contains every change below.

## What just landed

### Model registry — Journey 14 port

- `apps/mobile/app/more/models.tsx` — list refactored from inline-action cards to tappable navigation rows. Each row routes to `/more/models/[id]`. Removed the inline expand chevron and the embedded `ModelDetails` panel. Inline buttons kept only for non-active states: `Install` (available), `Activate` / `Restore` (installed/rollback), `Cancel` (installing).
- `apps/mobile/app/more/models/[id].tsx` — **new** detail screen. Hero card + 3-up KPI strip (ACC / MAP / SIZE) + Performance / Model / Training / Artifact sections with right-aligned mono values. Falls back to registry candidates when the id isn't installed yet — the bottom action swaps between `Delete this model` (installed) and `Install` (available). Activation history deferred until `model_events` exists.
- Three-stat tile row (`acc · mAP · size`) introduced on the list card; replaces the old single-line meta + mAP pill. "Download" label renamed to "Install"; "previousPill" renamed to "Rollback".
- Active card on the list uses a 2px green left-rail accent (replaces the prior lavender background fill).
- `apps/mobile/components/ui/KV.tsx` — **new** shared label/value row with `isLast` prop in place of NativeWind's unreliable `last:` modifier.
- `apps/mobile/lib/strings.ts` — **new** `truncateMiddle` + hardened `formatPrimitive` helpers.

### Reinstall-blocks-inspection bug — "Model readiness required" after rebuild

- `apps/mobile/lib/models/modelStore.ts` — `readInstalledModels`, `readActiveModel`, and `readPreviousActiveModel` now re-anchor stored absolute URIs against the current `FileSystem.documentDirectory`. Root cause: the registry's `artifactUri` / `compiledArtifactUri` were baked at install time with the absolute container-UUID path. On reinstall (or when the iOS container UUID rotates) the new `documentDirectory` differs, the stored URIs are stale, `quickVerifyArtifact` reports `info.exists === false`, and the inspection gate falls through to `"missing"`. The fix derives paths from `modelInstallDir(id)` instead of trusting the persisted absolute URI.
- **Verified on device.** Metro log after the rebuild reported `[analyzer] coreml active model=production-459bf03a-…-ios status=active`; the gate no longer trips after reinstall.

### Rules-of-Hooks fix in live capture

- `apps/mobile/app/capture/scan.tsx` — the `recDurationLabel` `useMemo` was sitting _below_ three early returns (model-readiness gate, LiDAR-calibration gate, main HUD). When LiDAR calibration completed, `lidarGateActive` flipped from true to false, the render path widened, and React raised `"Rendered more hooks than during the previous render"`. Hoisted the `useMemo` above every early return and added a boundary comment so future hooks don't drift back down. Surfaced after the path-staleness fix made the gate transition faster — the new hot path was exercising a latent ordering bug that the previous slower flow rarely hit.

### Buttons / design system

- `apps/mobile/components/ui/Button.tsx` — `ghostDanger` variant updated from `bg-transparent active:bg-bg-secondary` to `bg-danger-bg active:opacity-80`. Delete buttons now show a visible at-rest pink fill that darkens on press; press feedback no longer pops a gray rectangle inside colored cards.

### Settings

- AppTopBar now renders `t("settings:title")` ("Settings" / "การตั้งค่า") instead of the empty title.
- Sync row: Retry all → `variant="primary"` (purple solid), Clear failed → `variant="ghostDanger"` (red ghost).

### More tab

- Top profile card removed (duplicated the Account → Profile row). Cleaned up `initials` / `role` / `RolePill` import; `profile` destructure trimmed.

### Reports

- Variety filter converted from a hand-rolled inline-expand list to the shared `DropdownSearch` modal sheet. `DropdownSearch` is now the single dropdown primitive everywhere. Variety options gain a tinted thumb (matching `color_key`) as a side benefit of moving to the shared component.

### Recordings (each video card)

- i18n: "Share recording" / "แชร์วิดีโอ" → "Share" / "แชร์". "Save recording" / "บันทึกวิดีโอ" → "Save" / "บันทึก".
- Visible red "Delete" label added next to the trash icon (icon-only previously).

### Calibration

- Removed the redundant Share button (it called the same `onShareMarker` handler as Save PDF). Save PDF now spans full width. Dropped unused `Share2` icon import.

### Varieties (tab — not the More-menu Varieties)

- AppTopBar right-side `Search` icon button removed.
- Search input redesigned to mirror the More-menu Varieties pattern: `h-11`, hairline border, `autoCapitalize="none"`, `autoCorrect={false}`. Surface-contrast adapted to the tab's `bg-bg-secondary` surface (lighter pill on darker surface).
- Detail page: removed "Edit variety" + "Capture classes" admin-only action block (admin pencil shortcut in the AppTopBar still works).
- Detail page Grade thresholds card: now reads from `variety.grade_criteria` (the real configured criteria) instead of synthetic `buildThresholds(meanL, meanW)` averages. Shows length and width ranges when configured, falls back to "Not configured" / "ยังไม่ได้ตั้งค่า" when a grade is absent. ChevronRight removed from each row.

### i18n changes

- EN: `more.json` (model registry detail section + KPI/field/action keys, `subtitleInstalled`, `detailNotFound`), `profile.json` (share/save renames), `varieties.json` (`gradeNotSet`).
- TH: matching translations for all of the above.

## Open / pending

| Area         | Item                                      | Notes                                                                                                                                                       |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model detail | Activation history section                | Deferred — depends on a `model_events` table that doesn't exist yet.                                                                                        |
| Model detail | Re-verify + Copy ID actions               | Removed from the UI (were no-op scaffolds). Re-add when the underlying behavior is implemented.                                                             |
| Smoke test   | Live capture after the Rules-of-Hooks fix | Re-launch live capture after the rebuild and confirm the HUD reaches the main view without the "Rendered more hooks than during the previous render" error. |

## How to verify

1. **Type check:** `cd apps/mobile && npx tsc --noEmit -p .` → expect 0 errors.
2. **Path-staleness fix:** Install a model from the registry. Rebuild the iOS app on the same device without deleting (`npx expo run:ios --device <UDID>`). Open a variety, tap Start inspection — should NOT show "Model readiness required" any more.
3. **Model registry list:** Tap a card → routes to `/more/models/[id]`. Tap an available card → detail screen shows the metadata + a purple `Install` action. Tap an installed card → detail screen shows the metadata + a red `Delete this model` action.
4. **Varieties Grade thresholds:** Open a variety in the Varieties tab. If `grade_criteria` is configured (admin → More → Varieties), the A/B/C rows show real ranges; otherwise each row shows "Not configured". ChevronRight is gone.
5. **Reports variety filter:** Tap the variety pill → the shared bottom-sheet modal opens with typeahead, not the inline expanded list.
6. **Recordings:** Each video card shows "Share / Save / Delete" labels; the Delete icon has a visible red text label next to it.

## 1. Model registry — detail screen and list refactor

- [x] 1.1 Add `/more/models/[id]` route at `apps/mobile/app/more/models/[id].tsx` with hero card, 3-up KPI strip, and Performance / Model / Training / Artifact sections.
- [x] 1.2 Wire a unified `DetailView` view-model so the screen renders identically from an `InstalledModelRecord` or a registry `ModelCandidate`; swap the bottom action between Delete and Install based on source.
- [x] 1.3 Refactor `apps/mobile/app/more/models.tsx` cards into tappable navigation rows with chevron-right; remove the inline expand chevron + `ModelDetails` panel.
- [x] 1.4 Replace the lavender card-fill on the active row with a 2-px green left-rail accent.
- [x] 1.5 Introduce the three-stat tile row (`acc · mAP · size`) on the list card and `<StatStrip>` helper.
- [x] 1.6 Add `apps/mobile/components/ui/KV.tsx` shared label/value row with `isLast` prop.
- [x] 1.7 Add `apps/mobile/lib/strings.ts` with `truncateMiddle` + hardened `formatPrimitive`.

## 2. Reinstall path-staleness fix

- [x] 2.1 Add `reanchorRecord` helper in `apps/mobile/lib/models/modelStore.ts` that rewrites the `artifactUri` / `compiledArtifactUri` prefix against the current `FileSystem.documentDirectory`.
- [x] 2.2 Apply re-anchoring inside `readInstalledModels`, `readActiveModel`, and `readPreviousActiveModel`.
- [ ] 2.3 Verify on iOS device: install a model, rebuild the app on the same device, confirm capture is not blocked by a spurious "Model readiness required".

## 3. Button + design polish

- [x] 3.1 Update `ghostDanger` Button variant to `bg-danger-bg active:opacity-80` so destructive ghost buttons read consistently.
- [x] 3.2 Settings: set AppTopBar title; switch Retry all to `primary`, Clear failed to `ghostDanger`.
- [x] 3.3 More tab: remove the duplicated profile card and clean up unused imports.

## 4. Dropdown unification

- [x] 4.1 Replace the inline-expand variety filter on Reports with `<DropdownSearch>`, adding a tinted leading thumb keyed on `variety.color_key`.

## 5. Recordings + Calibration cleanup

- [x] 5.1 Rename i18n `profile.recordings.share` and `.save` to short labels in EN + TH.
- [x] 5.2 Add a visible red "Delete" text label next to the trash icon on each recording card.
- [x] 5.3 Remove the redundant Share button from Calibration; let Save PDF span full width; drop the unused `Share2` import.

## 6. Varieties tab

- [x] 6.1 Drop the top-right Search icon button from the Varieties AppTopBar.
- [x] 6.2 Redesign the search input to mirror the More-menu Varieties pattern (h-11, hairline border, `autoCapitalize="none"`).
- [x] 6.3 Remove the admin "Edit variety" / "Capture classes" buttons from the variety detail page; keep the AppTopBar pencil shortcut.
- [x] 6.4 Rewire the Grade thresholds card to read from `variety.grade_criteria`; render length + width ranges; fall back to "Not configured" when a grade is unset; drop the trailing ChevronRight.

## 7. i18n

- [x] 7.1 Add the new keys to `packages/i18n/src/en/more.json` (`subtitleInstalled`, `detailNotFound`, `section.*`, `kpi.*`, `field.*`, `action.*`).
- [x] 7.2 Mirror in `packages/i18n/src/th/more.json`.
- [x] 7.3 Add `varieties.gradeNotSet` in EN + TH.
- [x] 7.4 Update `profile.recordings.share` / `.save` strings in EN + TH.

## 8. Verification

- [x] 8.1 `pnpm -F @advance-seeds/mobile typecheck` passes.
- [ ] 8.2 iPhone Air rebuild + smoke test the new detail route, the Delete-button color, the Recordings labels, and the Varieties Grade thresholds.
- [ ] 8.3 Reproduce the reinstall bug on the same device and confirm the fix.

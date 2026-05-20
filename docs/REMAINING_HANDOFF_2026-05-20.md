# Remaining handoff — 2026-05-20

Supersedes [`docs/REMAINING_HANDOFF_2026-05-15.md`](./REMAINING_HANDOFF_2026-05-15.md). Captures a long session covering: branch hygiene, the segment-measurement landing, two waves of UI review polish, the per-variety dynamic grade system (A–H), capture-flow perf work, and three independent CI fixes.

All shipped changes pass `pnpm -F @advance-seeds/mobile typecheck` and ESLint. CI (`Lint · Typecheck · Test · Build` + `OpenSpec validate`) is green on `main` as of [`2b1a07a`](https://github.com/anthropic-experimental/advance-seeds-field-inspector-demo/commit/2b1a07a).

## What just landed (13 commits, oldest → newest)

| SHA       | Title                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------- |
| `9ead911` | feat(analyzer): measure seed segments via min-area rect + mask area                               |
| `a369aa2` | feat(live): draw mask polygons in live overlay, hide bbox when present                            |
| `d25d48b` | fix(capture): show plain "Live" chip when not recording                                           |
| `c19ba02` | refactor(ui): Phase A review polish across Home / Detail / Profile / Settings                     |
| `146c546` | feat(grading): per-variety dynamic grade tiers (A–H + reject)                                     |
| `7cdba9a` | chore: close out review loose ends                                                                |
| `b16d1d9` | refactor(ui): remove Profile sign-out, right-align Recordings actions, add live-detect diagnostic |
| `48b6260` | perf(capture): trim ceremony delays; diagnose CoreML mask outputs                                 |
| (perf)    | perf(capture): photo-speed prioritization, lower live FPS, slower state ticks                     |
| `e2c45d6` | chore(format): prettier sweep on cherry-picked mask measurement files                             |
| `7f49906` | fix(supabase): widen SeedRow.grade to SeedGrade after enum extension                              |
| `9421dff` | fix(i18n): add missing th byVariety.runs_one plural form                                          |
| `2b1a07a` | perf(capture): polygon renders + upload no longer blocks analyze                                  |

### Segment polygons end-to-end

- Cherry-picked `dcea52f` + `190c86f` from `claude/add-segment-measurement-1TYOl` into main. Resolved two conflicts: `SeedDetailView.tsx` (kept the redesigned layout, skipped the pre-redesign perimeter/circularity/rotation rows), iOS `AdvanceSeedsCoreMLFrameProcessorPlugin.mm` (kept HEAD's `modelPath` null-gate + try/catch, added incoming `wantMask` reads and conditional `HashMap` return), Android `AdvanceSeedsTfliteFrameProcessorPlugin.kt` (same structural pattern). `DetectionOverlay.tsx` color stayed at `#7DD3C7` (redesign teal), not the incoming `#22C55E`.
- `dcea52f`'s analyzer infra (`maskMeasurement.ts`, `yoloSegMask.ts`, `attachSegmentationPolygons`, `unrotatePoint` in `yolo.ts`) is in.
- `190c86f`'s UI changes — polygon outline on the live overlay + `seed.mask` hidden bbox ring on the seed-detail hero — are in.
- **Initial render bug fixed in [`2b1a07a`](https://github.com/anthropic-experimental/advance-seeds-field-inspector-demo/commit/2b1a07a):** the original `PolygonOutline` rendered the SVG inside the per-detection bbox `<View>` clipped to `bboxW × bboxH`. Seg masks routinely extend a few pixels past the bbox, so the outline was either invisible or partial. Replaced with a single stage-sized `<Svg>` that lives as a sibling of the bbox containers; polygon vertices were already in stage coordinates, so no extra math.
- Native rebuild required for the `a369aa2` / `48b6260` plugin changes — user confirmed done on iPhone Air. Today's polygon-render fix in `2b1a07a` is pure JS, so a Metro reload is sufficient.

### Per-variety dynamic grades (A–H + reject)

- `SeedGrade` widened from `"A" | "B" | "C" | "reject"` → `"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "reject"` in `packages/types/src/domain.ts`.
- `GradeCriteriaGrade` switched from `Extract<SeedGrade, "A" | "B" | "C">` to `Exclude<SeedGrade, "reject">` so it generalises automatically.
- New runtime constant `GRADE_LETTERS` exported from the types package — canonical A→H iteration order. Mirrored locally in `apps/mobile/lib/analyzer/grading.ts` so `node --test` can run without cross-package runtime resolution.
- `apps/mobile/lib/grading/palette.ts` — **new** `gradePalette(letter)` returning `{ bg, ink, bgClass, inkClass }`. A/B/C/reject reuse existing design tokens; D–H get fresh inline hex (Tailwind classes can't be generated at runtime). Also exports `gradeLabel(grade, t)` and `availableGradesForVariety(variety)`.
- Variety editor (`apps/mobile/app/more/capture-classes/[id].tsx`) — `GradeCriteriaForm` widened to `Partial<Record<GradeCriteriaGrade, ...>>`. New varieties start with a single A tier; `+ Add grade {next-letter}` button appends; trash icon per row removes down to a one-tier minimum. Iterates `gradesInForm(value)` instead of a fixed `[A, B, C]`.
- Variety detail (`apps/mobile/app/varieties/[id].tsx`) — `ThresholdRow` loop iterates only tiers the variety defines, rendering nothing when `grade_criteria` is null (was forcing three "Not configured" rows).
- The dead alternate editor at `apps/mobile/app/varieties/edit/[id].tsx` — no callers anywhere in code — was removed.
- Inspection detail (`apps/mobile/app/inspections/[id].tsx`) — `gradeFilters` derived from the seeds actually present in this inspection. Old A/B/C/reject captures still show their chips; new D+ captures surface the right ones automatically.
- Capture review (`apps/mobile/app/capture/review.tsx`) — grade tile strip + sort key driven by `GRADE_LETTERS`. New helpers `gradeSortKey` and `gradeTileLetters` at the bottom of the file.
- SeedDetailView — new optional `availableGrades` prop. Both callers (`/capture/seed/[index]` and `/seed/[inspection]/[index]`) compute it via `availableGradesForVariety(variety)`, looking up `variety` by id from `useVarieties()`.
- `GradeChip`, `seedThumbTone`, and `GRADE_RING_HEX` all consume `gradePalette()` — no more `Record<SeedGrade, X>` palette maps.
- Grading logic (`apps/mobile/lib/analyzer/grading.ts`) — `gradeFromCriteria` walks `GRADE_LETTERS` instead of `["A","B","C"]`. New test asserts D-tier evaluation. 39/39 analyzer tests pass.
- **DB migration `supabase/migrations/20260520000001_seed_grade_extend.sql`** — `ALTER TYPE public.seed_grade ADD VALUE 'D'..'H'`. Forward-only.
- `packages/types/src/supabase.gen.ts` was hand-widened to match the new enum until the next full regen.

### Capture-flow perf

Combined latency wins on iPhone Air (~1.2 s reduced per shutter):

| Lever                           | What changed                                                                                | Effect                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Ceremony delays                 | `processing.tsx` calibration timer 600 ms → 120 ms; pre-Review grading delay 350 ms → 80 ms | ~750 ms                                              |
| Photo quality balance           | `Viewfinder.tsx` Camera now passes `photoQualityBalance="speed"`                            | ~200–500 ms in `takePhoto`                           |
| Live FPS default                | `DEFAULT_HYPERPARAMS.targetFps` 30 → 15                                                     | Halves live worklet load; storage key bumped v7 → v8 |
| Render throttle                 | `RENDER_THROTTLE_MS` 33 → 66 in both CoreML + Android paths                                 | Halves main-thread re-renders                        |
| Photo upload                    | `photo.upload` is now `void`'d, not awaited, before ArUco + analyze                         | ~1 s of perceived stall removed                      |
| iOS post-shutter navigate delay | `scan.tsx` 60 ms delay is now Android-only                                                  | ~60 ms on iOS                                        |

### Review-pass polish (Phase A)

- Home: `SyncBanner` component + reference removed. The inline `SyncPill` on the filter row remains the sole sync indicator.
- Inspection detail: top-right kebab → `Share2` icon wired to `shareImage` / `shareVideo` (native share sheet). Footer `Share` + `Export` buttons (both silently called `saveImage`) removed.
- Recordings: per-row `Save` button + `onSave` plumbing removed. Share + Delete now share an end-justified `justify-end` row (was `Share` left, `Delete` `ml-auto`).
- Hyperparameters defaults: scoreThreshold `0.25 → 0.75`, iouThreshold `0.65 → 0.85`, FPS 30 → 15. Storage key v6 → v8.
- Profile: "This account · last 30 days" heading + 3 KPI cards (Inspections / Seeds / Sync rate) + stat derivation removed. Sign out was added in `7cdba9a` and removed again in `b16d1d9` per follow-up review.
- Settings: Sign out button + `onSignOut` removed.
- Live capture chip: now shows just "Live" when idle (was "Live · Capture · RECT").
- Inspection detail Rules-of-Hooks fix from prior session still in place (`scan.tsx` `recDurationLabel` `useMemo` hoisted above early returns).

### CI fixes

| Failure                                    | Root cause                                                                                                                                   | Fix                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Format check`                             | 4 `.mjs` files from segment-measurement cherry-pick had different prettier style                                                             | `prettier --write` on `maskMeasurement.mjs`, `maskMeasurement.test.mjs`, `yoloSegMask.mjs`, `yoloSegMask.test.mjs` |
| `Typecheck (workspace recursive)`          | `supabase/scripts/seed-inspections.ts` had hardcoded `"A" \| "B" \| "C" \| "reject"` literal type that didn't track the `SeedGrade` widening | Imported `SeedGrade` from `@advance-seeds/types`, used directly                                                    |
| `Test (workspace recursive)` — i18n parity | `packages/i18n/src/th/reports.json` was missing `byVariety.runs_one`                                                                         | Mirror the `_other` value into `_one` so both keys exist (Thai has no plural inflection so the string is the same) |

### Branch hygiene

- `redesign/sprint-1-foundation` (1 commit ahead of main): merged into main via PR #1.
- `redesign/sprint-2-marquee` (29 commits ahead, 0 behind): merged into main via local `git merge --no-ff` (commit `09b72c2`) and pushed. GitHub auto-closed PR #2 as "closed" (not "merged") because its base was the stacked `redesign/sprint-1-foundation` branch — the code itself is 100% in main; the label is a stacked-PR artifact.
- `codex/runtime-morph-preprocessing`: 6 behind, 0 ahead — stale.
- `claude/add-segment-measurement-1TYOl`: 2 of 3 commits cherry-picked. The last commit `8daa1b7 feat(analyzer): per-variety volume + weight estimation via shape models` was deliberately skipped — not asked for, and adds a separate analyzer feature.

## Open / pending — for the next session

| #   | What                                                                                                                                                                                                                                                                                               | Status                         | Where                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Deploy blocker:** run `supabase db push` to apply migration `20260520000001_seed_grade_extend.sql`. Without it, saving a seed with grade D–H will hit a Postgres enum violation.                                                                                                                 | Coded ✓ · Deploy ❌            | `supabase/migrations/20260520000001_seed_grade_extend.sql`                                                                         |
| 2   | Regenerate `packages/types/src/supabase.gen.ts` after the migration runs against a live DB. I hand-widened it; next `supabase gen types typescript` will produce the same shape, just cleaner.                                                                                                     | Coded ✓ · Regen later          | `packages/types/src/supabase.gen.ts`                                                                                               |
| 3   | Verify on device after Metro reload: polygons render, capture latency ~1 s faster, "Live" chip simplified, new hyperparam defaults visible, variety editor add/remove grades works.                                                                                                                | Pending device test            | n/a                                                                                                                                |
| 4   | Cherry-pick `8daa1b7 feat(analyzer): per-variety volume + weight estimation via shape models` if/when the per-variety volume feature is wanted.                                                                                                                                                    | Not requested this session     | `origin/claude/add-segment-measurement-1TYOl`                                                                                      |
| 5   | Port "Perimeter / Circularity / Rotation" rows to the redesigned `SeedDetailView`. `dcea52f` added these to the pre-redesign Card/Row layout, which no longer exists; explicitly skipped during the cherry-pick conflict resolution. Would surface mask metrics on the seed-detail hero.           | Backlog                        | `apps/mobile/components/inspections/SeedDetailView.tsx`                                                                            |
| 6   | Strip iOS dev diagnostic logs once polygon work is confirmed stable: `[CoreML FP] LOADED model — key=… outputs=[…]`, `[CoreML FP] wantMask=YES observed outputs=[…]`, `[live-detections coreml] outputKind=… hasProto=… polygons=…`. They are `__DEV__`-gated and rate-limited, but chatty.        | Diagnostic still in place      | `apps/mobile/lib/analyzer/useLiveDetections.ts`, `apps/mobile/modules/coreml-runner/ios/AdvanceSeedsCoreMLFrameProcessorPlugin.mm` |
| 7   | Sweep dead i18n keys orphaned by Phase A removals: `home:allSynced/syncPending/syncFailed/lastSync/neverSynced`, `profile:stats.*`, `profile:statsHeading30d`, `inspections:detail.saveImage`, `profile:recordings.save/savedToPhotos/permissionDeniedTitle/Body`. Harmless until next i18n audit. | Backlog                        | `packages/i18n/src/{en,th}/*.json`                                                                                                 |
| 8   | Upgrade CI actions to Node 24-compatible versions. Hard deprecation cut **2026-06-02**. Currently `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`.                                                                                                                          | Will start failing in ~13 days | `.github/workflows/*.yml`                                                                                                          |
| 9   | Delete fully-merged branches (`redesign/sprint-1-foundation`, `redesign/sprint-2-marquee` locally + on origin; `codex/runtime-morph-preprocessing` if you don't need it).                                                                                                                          | Branch list cleanup            | n/a                                                                                                                                |
| 10  | Drop `stash@{0}` (`lint-staged automatic backup`) if you don't need it. Pre-existing from before this session.                                                                                                                                                                                     | Stash list cleanup             | `git stash drop stash@{0}`                                                                                                         |

## Open investigations (only triage if symptom returns)

- **If polygons render but are mirrored / wrong shape on device** — coordinate-space bug in the stage-level SVG render path landed in `2b1a07a`. We'd need a single seed's `s.mask.polygon` vs `s.bbox` from the Metro log to triage. Hypothesis: missing rotation transform that `unrotatePoint` may not be applying consistently in landscape sensor → portrait stage.
- **If `[live-detections coreml] outputKind=segmentation hasProto=false polygons=0` returns** on a known-seg model — model export issue. Check `[CoreML FP] LOADED model — key=… outputs=[…]` for a rank-4 entry. No rank-4 → model has NMS baked in and dropped the prototype tensor at export.
- **If Save fires before the background photo upload completes** — `session.uploadedImageUrl` will be a local `file://` URI rather than a Supabase public URL. The existing sync queue should retry on the next online attempt, but worth confirming the queue replay actually fires for this case.

## Decisions captured for future me

- **Per-variety dynamic grades, letter-only auto-assigned (A→H), old A/B/C/reject inspections stay read-only.** No migration of historical seed grades.
- **Phase A bulk-commit preferred over per-topic commits** for small UI sweeps.
- **Local merge with `--no-ff` for landing feature branches in main**, preserves feature boundary for `git revert -m 1 <merge-sha>`.
- **Cherry-pick when source branch is ≥10 commits behind main** (avoid replaying old code on top of new).
- **Skip stacked-PR auto-merge:** GitHub marks PR #2 "closed" (not "merged") when its base was `redesign/sprint-1-foundation` rather than `main`. Code is in main correctly; the label is a stacked-PR artifact.
- **Background uploads + existing sync queue is a forgiving pattern.** Letting `photo.upload` resolve in the background while the user reviews is safe because the queue already handles upload-failure / local-URI fallbacks.
- **`runAtTargetFps` is intelligent frame-skipping**, not a fake throttle — Vision Camera drops frames before the worklet runs. Lowering FPS is a real perf win, not a UX lie.
- **Storage-key versioning is the right pattern for changed defaults.** Bumping `v7 → v8` invalidates existing AsyncStorage entries so users actually feel the new defaults on next launch.

## What to verify on next device test

1. **Polygons render** — outline traces each seed's actual shape, bbox border suppressed. Filled with a soft class-color tint, stroked at 1.5px.
2. **Capture latency ~1 s faster** — tap shutter → "Detected N seeds" should feel near-instant. Background upload happens during Review.
3. **Live overlay smooth at 15 fps** — should still feel "live" with no jank.
4. **"Live" chip** simplified (no "· Capture · RECT" tail).
5. **New hyperparam defaults active** — More → Hyperparameters should show conf=0.75, IoU=0.85, FPS=15 (storage v8 invalidated old values).
6. **Variety editor** lets you start with grade A and "+ Add grade B/C/…" up to H, plus trash icon to remove down to one tier.
7. **Inspection detail's Share button** at top-right opens the native share sheet (was silently saving to gallery before).

If anything's off, the diagnostic log line to read is:

```
[live-detections coreml] outputKind=segmentation hasProto=true polygons=N
```

`hasProto=true polygons=N>0` = pipeline working; check rendering.  
`hasProto=true polygons=0` = decoder produced no contours; check model + bbox thresholds.  
`hasProto=false` = native plugin didn't surface the prototype tensor; check model export.  
`outputKind=raw|nms` = not a seg model; switch to one in More → Models.

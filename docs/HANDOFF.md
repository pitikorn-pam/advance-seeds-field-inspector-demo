# Advance Seeds Field Inspector Demo — Current Handoff

Last updated: 2026-05-24

## Current State

Advance Seeds Field Inspector is a mobile-first Expo/React Native demo backed by Supabase. The app uses installed model artifacts for YOLO segmentation on device, renders segmentation polygons when mask metadata exists, and persists inspection metadata for calibration, model provenance, ROI, media references, detector filter, and per-seed detected class identity.

The active repo path for native work is:

```bash
/Users/ppungpong/Github/advance-seeds-field-inspector-demo
```

Do not build from the iCloud/emoji path. CocoaPods/Ruby has failed there before.

## Source Of Truth

- Design source: `DESIGN.md`
- Token source: `docs/handoff/design-tokens.json`
- Durable specs: `openspec/specs/**/spec.md`
- Active OpenSpec changes:
  - `openspec/changes/detect-all-class-first-inspection`
  - `openspec/changes/model-registry-detail-and-ui-polish`
- Supabase migrations: `supabase/migrations`

Old dated handoff files were removed. Use this file plus OpenSpec for continuation.

## Recent Changes To Verify

- Class-first detect-all workflow:
  - Capture setup now defaults to detector filter `ALL` and no longer requires a variety before camera entry.
  - Optional filter choices come from the active model's `metadata.class_names`.
  - Live scan, precise capture, and post-shutter processing share the same detector filter resolver.
  - `ALL` sends no analyzer class filter; selected classes send active-model class indexes/aliases.
  - New saves persist `seeds.class_id` and `seeds.class_name`; inspection metadata stores `detector_filter` and `class_breakdown`.
  - Inspection detail shows class filter chips only when saved seed class data exists. Legacy rows without class data still use the old grade filters.
  - The old "must infer/map one variety before save" workflow is deprecated. `inspections.variety_id` is now nullable/legacy compatibility data, not the source of truth for detection.

- Recording deletion:
  - Deleting a recording is allowed.
  - Linked inspections are marked with `metadata.capture_media.video_deleted_at`.
  - Inspection detail falls back to the still thumbnail when a linked video was deleted.
  - Supabase migration `20260522000001_recordings_admin_delete.sql` is applied remotely.

- Inspection and seed result overlays:
  - Saved metadata stores mask polygons plus class label / volume when available.
  - Inspection detail, share/export, and seed detail prefer segmentation polygons over bbox rings.
  - Labels should show detected class, mm, area, and volume instead of `Object`.

- Snapshot:
  - Live snapshots attempt annotated SVG export and fall back to raw JPEG on iOS Photos import failure.

## Common Commands

```bash
pnpm -F @advance-seeds/mobile typecheck
pnpm -F @advance-seeds/mobile lint
node --test apps/mobile/lib/inspections/metadata.test.mjs
openspec validate --all --strict
supabase migration list --linked
```

Metro:

```bash
pnpm --filter @advance-seeds/mobile start
```

Native rebuild is only required for native-module, pod, Gradle, entitlement, or app config changes. JS/TS UI behavior should reload through Metro in the existing dev build.

## Known Pending Items

- Supabase CLI is installed locally, `pnpm supabase:start` applied migration `20260524000001_class_first_inspections.sql`, and `pnpm supabase:types` regenerated `packages/types/src/supabase.gen.ts`.
- `model-registry-detail-and-ui-polish` still has device smoke-test tasks unchecked.
- If Supabase CLI policy/advisor verification hits pooler `ECIRCUITBREAKER`, wait and retry sequentially. The migration history is the primary proof that the migration applied.

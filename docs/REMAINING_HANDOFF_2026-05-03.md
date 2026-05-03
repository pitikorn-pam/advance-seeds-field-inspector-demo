# Remaining handoff — 2026-05-03

Supersedes `docs/REMAINING_HANDOFF_2026-05-01.md`. Captures the state after transitioning the project to a **mobile-only** architecture, completing `mobile-real-usage`, and finishing the `mobile-offline-sync` queue.

## What just landed

### Mobile-only architecture

- **Web dashboard removed**: `apps/dashboard` has been deleted entirely.
- All related deployment workflows and documentation cross-references have been purged.
- The project is now laser-focused on the mobile field-inspector experience.
- The `demo-script.md` was rewritten to drop the web dashboard stage and instead use a Supabase Studio walkthrough to show real-time cloud data.

### OpenSpec workflow

- `mobile-real-usage` was archived. 9 delta specs were synced into the main specs, promoting 5 new capability specs (`live-calibration`, `live-camera-capture`, `live-recording-and-snapshots`, `mobile-distribution`, `mobile-onboarding`).
- `mobile-offline-sync` was fully verified and archived. A new capability spec was added for it.
- **Current Spec State**: 15 durable capability specs, 4 archived changes, 0 active changes.
- The `openspec validate --all` check passes completely.

### Version 0.3.0

- Tagged `v0.3.0` on commit `89395a2`.
- `0.3.0 (1)` distributed via Firebase App Distribution to the `internal` group for Android testers.

## Open issues & pending QA

### 🟡 Android live preview stutters

- **Status**: Fixes applied, awaiting field verification.
- **Verification needed**: Need to test the `0.3.0 (1)` artifact on the Z Flip 7 FE (SM-F761B). Walkthrough: Inspect → Precise/Live → calibration lock → recognizable object in frame. Check if the bounding boxes still stutter or if the camera HAL `maxImages (6)` overflow persists.

### 🟡 Android offline-sync QA

- **Status**: Implemented and unit-tested, pending manual wired-device walkthrough.
- **Verification needed**: Manual airplane-mode walkthrough. Toggle airplane mode → capture inspection → Save and sync → check `/inspections/pending/<id>`. Disable airplane mode → confirm auto-redirect to remote inspection. Repeat for video recordings.

### Known Polish (Non-blocking)

- Printable ArUco calibration card art is missing (code path exists for sharing it).
- `withSpring` overlay transitions for fast pans are deferred.

## What's next

### Ready for the next phase

With the foundation, mobile real usage, and offline sync complete, the path to production beta (estimated 6-10 weeks) primarily involves:

1. **Real YOLOv11n integration (Phase 4)**: Swap `MockSeedAnalyzer` for TFLite/CoreML in `apps/mobile/lib/analyzer/`.
2. **Live calibration (Phase 5 part 2)**: Custom Expo Modules wrapping OpenCV (Swift/Kotlin) + ARKit for ArUco and LiDAR.
3. **iOS distribution**: Apple Developer Program enrollment, EAS preview profile, Firebase App Distribution.
4. **Minor features**: Skia detection-overlay rings, polygon vertex drag, circle radius drag, real seed photos in `seed.sql`.

## Commit hygiene

- **Today's commits**:
  - `chore(openspec): archive mobile-offline-sync, sync delta spec`
  - `chore(openspec): archive mobile-real-usage, sync 9 delta specs`
  - `chore(release): tag v0.3.0`
  - `docs: rewrite demo script for mobile-only flow`
  - `chore: remove dashboard app and related artifacts`

## Local dev reminders

- Work only from `/Users/ppungpong/Github/advance-seeds-field-inspector-demo`.
- Use `apps/mobile/./node_modules/.bin/expo`, never `pnpm dlx expo`.
- `ios/` and `android/` are generated/gitignored; clean prebuild after native-module or `app.json` plugin changes.
- Ensure all new capabilities go through the OpenSpec workflow before writing code.

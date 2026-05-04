# Remaining handoff — 2026-05-04

Supersedes [`docs/REMAINING_HANDOFF_2026-05-03.md`](./REMAINING_HANDOFF_2026-05-03.md). Captures the state after a long working session that closed several Model Registry, live-detection, calibration, and capture-pipeline issues.

## What just landed

### Model registry — usable end-to-end on iPhone Air

- **UI redesign** of `apps/mobile/app/more/models.tsx`: single unified list (Active / Installed / Available collapsed into one), per-row status pills, channel selector inline with the Available header, status banners (success/danger), expandable per-row Details panel showing performance metrics, training hyperparams, model + artifact info, channel + Default chip-tags, registry refresh + 1-Hz "refreshing" indicator (no flicker on reload), delete confirmation, restore (rollback) inline.
- **Banner deep-link** flow: from Home, `Install` on the model-update banner routes to `/more/models?install=<version_id>` and auto-installs the matching candidate; "already installed" / "candidate missing" surfaces a status banner instead of a silent fail.
- **Auto-install on Wi-Fi** opt-in toggle (Settings → Models). Default off. Custom `Toggle` component in design DNA replaces the platform Switch.
- **Notification on new model** ([`ModelUpdateNotifier`](../apps/mobile/components/home/ModelUpdateNotifier.tsx)): emits the in-app notification on the FIRST sighting of each version_id (AsyncStorage-keyed), persists across launches.
- **Variety editor**: chip-multiselect of the active model's `class_names` for `model_class_aliases` (new column on `varieties` — migration `20260504000001_varieties_model_class_aliases.sql` applied to remote).
- **Active model** is consulted via three-tier `mapClassFilterForModel`: explicit aliases → variety-name substring → COCO synonym fallback. Tier 4 also passes through the variety's COCO id directly so models that preserve COCO indices in their post-NMS output (Ultralytics fine-tunes from COCO weights) draw boxes correctly.

### Live capture — overlay now draws on iPhone Air

Two real bugs + one workaround uncovered:

1. **iOS frame-processor plugin** picked the largest output tensor — for YOLO26-seg this returned the mask prototype `[1, 32, 160, 160]`, not detections `[1, 300, 38]`. Fixed by selecting by **shape signature** `[1, 300, 6 | ≥38]` (`AdvanceSeedsCoreMLFrameProcessorPlugin.mm`).
2. **Frame orientation** wasn't forwarded to `VNImageRequestHandler`. Camera buffer arrives in landscape sensor orientation; without the hint, Vision fed the model a sideways image and confidence collapsed. Fixed by mapping `Frame.orientation` (UIImageOrientation) → `CGImagePropertyOrientation` and passing it to the request handler.
3. **Workaround**: the user's custom YOLO26-seg model emits COCO-preserved class indices (banana=46, etc.) in its post-NMS output despite declaring 6 custom classes. `mapClassFilterForModel` now accepts both 0-based indices AND original COCO ids, so detections pass through. Long-term fix is to re-export the model with proper class indices.

### Continuous LiDAR calibration

`useLiveLidarCalibration` now streams `pxPerMm` at 10 Hz with EMA smoothing instead of a one-shot stability lock. Operators move the device freely; seed sizes recompute per frame. `scan.tsx` + `precise.tsx` consume the live result directly — `lockedLidar` / `lidarReleased` state removed. Calibration overlay dismisses on first confident reading.

### Capture-time media optimization

- Photo upload: `optimizeImageForUpload` (expo-image-manipulator) resizes 4032×3024 captures to 2048 long edge at q=0.85 — typical ~5× upload bytes reduction with imperceptible quality loss for grading crops. **Sources <1.5 MB are skipped**, and a **3 s wall-clock timeout** falls back to the original on stuck native calls.
- Video upload: iOS `RoiVideoExporter` switched to `AVAssetExportPreset1280x720` (was `HighestQuality`) — typical ~3-4× mp4 bytes reduction. Falls back to `HighestQuality` if the device doesn't support 720p.
- Video thumbnail: optimized to 1280 long edge, q=0.8.

### Inspection metadata

- `analyzer_model` snapshot on every save: id, display_name, source, model_name, version, analyzer_runtime, score_threshold, iou_threshold. Frozen at capture time so historical inspections stay traceable.
- "Detector model" row added to both Inspection Result (`review.tsx`) and Inspection Detail (`inspections/[id].tsx`) metadata blocks.
- **Section dividers** (`MetadataDivider`) inserted between Location / Device / Capture / Detector groups on both pages.

### Performance

- **Home cold-start sluggishness fixed**: `selectAnalyzer` was running a full SHA-256 verify on the active model's compiled artifact at every analyzer load (2–8 s blocking the JS thread). New `quickVerifyArtifact` (file existence + recorded byte size) runs in milliseconds; full SHA verify (`verifyInstalledArtifact`) reserved for install / activate.
- **Defer probe** in `AnalyzerProvider`: `resolveDefaultModel` now runs after `InteractionManager.runAfterInteractions` + 1500 ms so it doesn't compete with Home's first paint.
- **Default `scoreThreshold` reverted to 0.25** (Ultralytics export default). 0.10 was a temporary diagnostic value from earlier in the session.

### Navigation polish

- Cancel on Inspection Result → returns to capture mode screen (scan/precise) instead of Home.
- Pending detail back/cancel → `canGoBack`-guarded, falls back to `/` only when the navigation stack is empty.
- `/more/models` back → same canGoBack guard, eliminating the React Navigation `GO_BACK` warning when arrived via deep link.

### Tooling

- New script: [`apps/mobile/scripts/build-ios.sh`](../apps/mobile/scripts/build-ios.sh) — interactive iOS device picker (lists paired iPhones/iPads from `xcrun devicectl`), builds + installs in one step. Accepts a name/model substring or UDID for non-interactive use; `DEVELOPMENT_TEAM` env override.

## Release checkpoint

### ✅ v0.4.0 readiness

- Physical ArUco scene QA passed: Android Live reaches calibration lock and draws annotations with the printed marker + seed target in frame.
- iPad LiDAR field test passed: continuous LiDAR + EMA-smoothed `pxPerMm` tracks at normal iPad working distance.
- Mobile app version bumped to `0.4.0`, runtime version `0.4.0`, Android `versionCode` 3.
- Release tag target: `v0.4.0`.

## Open issues & pending QA

### ✅ ArUco lock during single-shot processing

- **Status**: App-side no-marker handling fixed after this handoff was written. The iOS native image detector used to return `nil` for a normal no-marker frame; Swift imported that Objective-C `NSError**` method as throwing and surfaced `Foundation._GenericObjCError error 0`. It now returns a zero-confidence detection sentinel, so JS treats it as "no calibration" without warning.
- **Verification**: Passed with the ArUco card clearly in frame.

### ✅ Model class-id mismatch (COCO preservation)

- **Status**: Re-export verified with proper 0-based class indices.
- **Repo cleanup**: Tier-4 COCO id pass-through removed from `mapClassFilterForModel`; custom segmentation models now rely on explicit aliases, variety-name matches, or COCO synonym mapping into the model's 0-based class space.

### 🟡 Save & sync perceived slowness

- **Status**: Mitigated. `optimizeImageForUpload` now skips files <1.5 MB and times out at 3 s. If still slow, investigate `create.mutateAsync` (Supabase RPC) latency or the offline-detection path.

### ✅ Android live preview QA on Z Flip 7 FE

- **Status**: Shape-signature tensor selection is fixed in the Android TFLite frame-processor and the JS TFLite analyzer. Live startup was retested on Z Flip 7 FE after moving live ArUco frame processing to Vision Camera `runAsync`; the repeat run held ~30 fps with no `maxImages` or `ERROR_CAMERA_DEVICE` logs.
- **Physical scene QA**: Passed with the printed ArUco card + banana seed target; UI reaches calibration lock and draws annotations.

## Verification commands

```bash
# Typecheck the mobile workspace
pnpm -F mobile exec tsc --noEmit

# Validate OpenSpec
pnpm exec openspec validate --all

# Build + install on a paired device (interactive picker)
apps/mobile/scripts/build-ios.sh

# Build + install matching by substring
apps/mobile/scripts/build-ios.sh "iPhone Air"
apps/mobile/scripts/build-ios.sh "iPad"

# Start Metro
pnpm -F mobile start

# Tail iPhone runtime logs (filter to our plugin / RN)
idevicesyslog -u $(idevice_id -l | head -1)
```

## What's next

1. Create and publish the `v0.4.0` release artifact if needed.
2. Keep monitoring save/sync latency during pilot usage.

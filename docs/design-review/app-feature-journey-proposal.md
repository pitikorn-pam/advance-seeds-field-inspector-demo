# Advance Seeds Field Inspector: Feature And Journey Design Brief

Last updated: 2026-05-14

## Purpose

This file is a design-generation brief for redesigning the Advance Seeds Field Inspector mobile app. It documents the existing product features, journeys, screen responsibilities, content, states, and constraints so another designer or design-generation tool can create a new visual direction without changing the app behavior.

The goal is a new clean, modern, easy-to-use design while preserving the current journey, routes, data contracts, capture flow, role behavior, offline behavior, and bilingual content structure.

## Non-Negotiables

- Keep the product identity as Advance Seeds Field Inspector.
- Keep all existing journeys and routes unless a future product spec explicitly changes them.
- Keep inspection capture as the primary workflow.
- Keep camera UI function-first. Do not add decorative layers over live video.
- Keep admin-only editing separate from inspector-facing browsing.
- Keep model readiness, calibration, and offline sync visible enough to avoid failed captures.
- Keep English and Thai content parity.
- Do not introduce backend schema, Supabase RLS, model contract, or capture data changes for a visual redesign.
- Do not add explanatory cards to every page. Use short labels, direct actions, and clear data presentation.

## Product Roles

### Inspector

Primary field user. Starts inspections, chooses a seed variety, captures samples, reviews detected seeds, adjusts grades if needed, saves records, and checks recent work.

### Admin

Maintains reference data and model readiness. Can edit varieties/capture classes, aliases, reference dimensions, and grade criteria. Also checks models, reports, settings, and sync state.

## Global Information Architecture

### First-Run And Auth Flow

1. Splash
2. Welcome/onboarding
3. Login
4. Main app tabs

### Main Tabs

- Home: dashboard, recent inspections, sync/model readiness, edge gesture capture entry.
- Inspect: direct capture entry point to setup.
- Varieties: active catalog browser and variety detail.
- More: account, settings, models, reports, history, recordings, calibration, admin reference tools.

### Capture Flow

1. Capture setup
2. Live camera scan
3. Processing
4. Review result
5. Save and sync
6. Inspection detail

### Supporting Flows

- Notifications modal and detail.
- Settings and profile.
- Reports export.
- Offline history and pending inspection detail.
- Model registry installation and activation.
- Hyperparameter QA tuning.

## Design Direction For New Work

The redesign should feel like a professional field QA workspace, not a marketing site. It should be calm, fast to scan, and optimized for repeated use in real field conditions.

Recommended qualities:

- Simple screen structure with obvious primary action.
- Compact but readable data summaries.
- Strong hierarchy between setup, capture, review, and reference browsing.
- Modern cards and toolbars, but not heavy decoration.
- Clear status treatment for ready, syncing, pending, failed, active, inactive, installed, and blocked.
- Consistent sizing, spacing, corner radius, typography, icons, and empty/loading/error states.
- Mobile-first layout with reliable thumb reach for capture and review actions.

Avoid:

- Extra feature explanation cards on operational screens.
- Marketing copy inside the app.
- Large decorative hero sections that push real work below the fold.
- Visual noise on camera, review, history, or settings pages.
- Deep dark page themes unless the screen genuinely benefits from it, such as camera.

## Journey 1: Splash, Welcome, And Login

### Routes

- `/splash`
- `/welcome`
- `/login`

### User Goal

Move from first app launch into a usable authenticated workspace with minimal friction.

### Current Behavior

The app checks whether onboarding has been completed and whether a Supabase auth session exists. New users see splash and welcome. Returning signed-out users go to login. Signed-in users go directly to the main tabs.

### Splash Screen Content

- Product name: Advance Seeds Field Inspector.
- Short positioning line around live seed inspection.
- Version/build information.
- Short loading/progress state.

### Welcome Screen Content

Preserve four capability ideas, but they can be redesigned:

- Live inspection board.
- Calibration stays attached.
- Synced records.
- Grade criteria.

Actions:

- Continue: requests camera and microphone permissions, marks onboarding complete.
- Skip: marks onboarding complete without permission prompt.

### Login Screen Content

- Demo role selector: Inspector and Admin.
- Prefilled credentials for selected demo role.
- Email/password form.
- Sign in action.
- Inline error state.

### States

- Loading session.
- Permission request.
- Login submitting.
- Login error.

### Design Guidance

Make this flow polished but short. Welcome can be slightly more visual than the rest of the app, but it should still feel like a field tool. Avoid long descriptions. Use concise value statements and strong primary actions.

### Must Preserve

- Onboarding gate.
- Permission request behavior.
- Demo account role switching.
- Auth session routing.

## Journey 2: Home Dashboard

### Route

- `/(tabs)/index`

### User Goal

See today’s inspection status, recent work, model/sync readiness, and quickly start capture.

### Current Content

- Greeting.
- Current date.
- User role pill.
- Notification bell.
- Date range filter:
  - Today
  - 7D
  - 30D
  - Custom
- Dashboard summary:
  - Runs
  - Seeds
  - Average millimeters
  - Last run
- Small chart showing inspection distribution.
- Variety mix summary.
- Recent inspections, limited to the latest three.
- Sync banner.
- Model update banner/notifier.

### Primary Actions

- Pull to refresh.
- Tap notification bell.
- Use date filters.
- Open recent inspection.
- Start capture through the Inspect tab.
- Start capture through left-edge drag gesture.

### States

- Loading dashboard.
- Empty dashboard.
- No inspections in selected date range.
- Sync pending.
- Sync failed.
- Model update available.
- Model install required or blocked.

### Design Guidance

Home should feel like an operational dashboard, not a landing page. The first screen should show real status quickly. Use a clean summary surface, compact metrics, and clear readiness signals. Do not use a dark “field workspace” hero by default. Keep the capture entry discoverable without reintroducing a redundant large “New inspection” button unless product direction changes.

### Must Preserve

- Date range filtering.
- Recent inspections behavior.
- Notification entry.
- Pull-to-refresh.
- Left-edge capture gesture.
- No redundant Home “+ New inspection” CTA.

## Journey 3: Capture Setup

### Route

- `/capture/setup`

### User Goal

Prepare an inspection by choosing the correct variety and confirming capture readiness.

### Current Content

- Active variety dropdown with search.
- Optional notes.
- Location auto-tag toggle.
- Model readiness gate.
- Active model and class alias binding checks.
- Permission checks for camera/microphone/photo library.

### Primary Actions

- Select variety.
- Search variety list.
- Add note.
- Toggle location tagging.
- Continue to camera.
- Open variety editor when model/class binding is missing.

### States

- No variety selected.
- Variety selected.
- Model missing.
- Model installing.
- Model installed.
- Class alias missing.
- Permissions missing.
- Setup blocked.

### Design Guidance

This screen should feel like a pre-flight checklist without becoming verbose. The selected variety and readiness should be obvious. Keep copy short and practical. If something blocks capture, show the exact fix and action.

### Must Preserve

- Variety is required.
- Notes are optional.
- Location tag toggle remains.
- Model/class gate remains.
- Continue routes to live camera only when ready.

## Journey 4: Live Camera Capture

### Route

- `/capture/scan`

### User Goal

Capture a seed sample with calibration, ROI, and live detections visible enough to trust the result.

### Current UI Areas

- Top camera bar:
  - Back.
  - Flash/torch cycle.
  - Flip camera.
  - Grid toggle.
- Live viewfinder.
- ROI overlay and ROI toolbar.
- Detection overlay.
- Calibration pill and calibration banner.
- KPI strip.
- Shutter bar.
- Recording timer.
- Toast feedback.

### Current Capabilities

- Photo capture.
- Video recording.
- Live detection overlay.
- ROI tools.
- Grid toggle.
- Flash/torch.
- Camera facing toggle.
- LiDAR calibration on supported iOS devices.
- ArUco fallback.
- Manual calibration fallback.
- Variety-aware class filters.
- Grade criteria-aware analysis.

### States

- Camera initializing.
- Camera permission blocked.
- Calibration ready.
- Calibration missing.
- Calibration degraded.
- Detection ready.
- Detection unavailable because model is missing.
- Capture busy.
- Recording active.
- Snapshot captured.
- Error toast.

### Design Guidance

Camera is the most function-first screen. Keep controls large enough for field use, but avoid covering the specimen. Use restrained color signals for ROI, detection labels, calibration, and capture state. The live video must remain dominant. Decorative styling belongs outside the viewfinder, not over it.

### Must Preserve

- Existing camera controls.
- ROI editing.
- Calibration feedback.
- Detection overlay.
- Photo and recording behavior.
- Model readiness gating.

## Journey 5: Processing

### Route

- `/capture/processing`

### User Goal

Understand that the capture is being analyzed and know whether to wait, retry, or cancel.

### Current Content

- Processing visual.
- Step/status text.
- Failure message when analysis or upload fails.
- Retry action.
- Cancel action.

### Processing Responsibilities

- Prepare captured media.
- Upload when needed.
- Run analyzer.
- Produce measurements and grade results.
- Attach ROI and calibration metadata.
- Prepare annotated media if available.

### States

- Preparing.
- Uploading.
- Analyzing.
- Finalizing.
- Failed.
- Retrying.

### Design Guidance

Keep this screen quiet and trustworthy. Use a simple progress pattern and short status language. Avoid making it feel like a marketing animation. On failure, the recovery action should be clearer than the technical error.

### Must Preserve

- Retry.
- Cancel.
- Route to review after successful processing.

## Journey 6: Review, Save, And Sync

### Route

- `/capture/review`

### User Goal

Verify the analysis, inspect individual seed grades, make quick grade corrections if needed, then save the inspection.

### Current Content

- Top bar:
  - Back.
  - Title.
  - Share action.
- Captured media preview with ROI overlay.
- Summary:
  - Grade result.
  - Total seeds.
  - Average dimensions.
- Per-seed list.
- Sort controls:
  - Index.
  - Grade.
  - Length.
- Metadata/diagnostics block:
  - Device.
  - Model.
  - Calibration.
  - Location.
  - Analyzer diagnostics.
- Save and sync action.
- Discard/cancel behavior.

### Primary Actions

- Review media.
- Sort seed list.
- Open in-progress seed detail.
- Edit grade.
- Save inspection.
- Share result.
- Discard.

### States

- Review ready.
- Save submitting.
- Save success.
- Save failed.
- Offline queue fallback.
- Missing media preview.
- Low confidence or calibration warning.

### Design Guidance

Review should prioritize decision-making. Put the result, media, and save action in a stable hierarchy. Diagnostics can be accessible but should not dominate. Seed rows should be easy to scan and edit.

### Must Preserve

- Grade edit behavior.
- Save/sync behavior.
- Offline queue fallback.
- Share action.
- Seed detail route.

## Journey 7: Inspection Detail And Seed Detail

### Routes

- `/inspections/[id]`
- `/seed/[inspection]/[index]`
- `/capture/seed/[index]`

### User Goal

Review a saved or in-progress inspection, inspect individual seeds, and update grade decisions when allowed.

### Inspection Detail Content

- Back and more menu.
- Variety name.
- Inspection date.
- Inspector.
- ROI badge.
- Media preview with ROI and seed overlays.
- Calibration warning when needed.
- Stat tiles.
- Metadata:
  - Notes.
  - Location.
  - Model.
  - Device.
  - Diagnostics.
- Grade filter chips:
  - All.
  - A.
  - B.
  - C.
  - Reject.
- Virtualized seed grid.
- Export/save media actions.
- Delete action when policy allows.

### Seed Detail Content

- Seed index.
- Grade.
- Confidence.
- Length.
- Width.
- Area.
- Image crop or preview when available.
- Grade edit controls.

### States

- Loading inspection.
- Not found.
- Media unavailable.
- Calibration warning.
- Grade updating.
- Delete blocked.
- Delete confirmed.

### Design Guidance

Saved inspection detail should feel archival and review-focused. Avoid dashboard-like clutter. Use clear grouping for media, result summary, seed list, and metadata. Seed detail should be compact and task-oriented.

### Must Preserve

- Grade filters.
- Virtualized seed list/grid.
- Grade edit.
- Media export.
- Delete policy behavior.

## Journey 8: Varieties Catalog

### Routes

- `/(tabs)/varieties`
- `/varieties/[id]`

### User Goal

Browse active seed varieties, understand recent measurement behavior, and start an inspection for a chosen variety.

### Catalog Content

- Search active varieties.
- Family filters:
  - All.
  - Corn.
  - Rice.
  - Legume.
  - Mungbean.
- Grouped variety sections.
- Variety rows:
  - Name.
  - Scientific name where available.
  - Family/color signal.
  - Recent observed dimensions from inspections.

### Variety Detail Content

- Variety name.
- Scientific name.
- Description.
- Image or seed-shape visual.
- Active/inactive status.
- Recent measurement summary.
- Recent inspection count.
- Grade A percentage.
- Start inspection action.
- Admin edit action.

### States

- Loading varieties.
- Empty active catalog.
- Search no results.
- Missing image.
- Inactive variety detail.

### Design Guidance

The Varieties tab is a catalog, not an admin table. It should be fast to browse and visually clean. Keep rows compact. The detail page should help the user confirm they picked the right variety and start inspection quickly.

### Must Preserve

- Active-only catalog browsing.
- Search.
- Family filters.
- Detail route.
- Start inspection prefilled with variety.
- Admin edit route.

## Journey 9: Admin Reference And Variety Editing

### Routes

- `/more/capture-classes`
- `/more/capture-classes/[id]`

### User Goal

Maintain the reference data that drives capture, detection mapping, reference dimensions, and grading.

### Reference List Content

- Search by:
  - Variety name.
  - Scientific name.
  - COCO class.
  - Identifier.
- Rows sorted with mapped classes first.
- Model class mapping status.
- Active/inactive status.
- Grade criteria status.
- Reference dimension status.
- Create action for admins.
- Edit action for admins.

### Editor Content

- Name.
- Scientific name.
- Description.
- Image URL.
- Color/family.
- Active toggle.
- Model class aliases.
- Reference length.
- Reference width.
- Grade criteria editor:
  - A length min/max.
  - A width min/max.
  - B length min/max.
  - B width min/max.
  - C length min/max.
  - C width min/max.
- Save.
- Delete.

### States

- Admin access allowed.
- Inspector read-only or blocked.
- Create mode.
- Edit mode.
- Validation error.
- Save submitting.
- Delete blocked because references exist.
- Delete success.

### Design Guidance

This is the densest form in the app. Make it structured and calm. Prefer grouped sections, clear labels, compact inputs, and persistent save/delete placement. Show validation near the exact field. Do not hide model alias and grade criteria because they are critical to capture quality.

### Must Preserve

- Admin gating.
- Alias mapping.
- Reference dimensions.
- Grade criteria editor.
- Delete guard for referenced data.

## Journey 10: Calibration

### Route

- `/calibration`

### User Goal

Access calibration reference material and understand the current calibration profile.

### Current Content

- ArUco 5cm marker card.
- Share/download marker action.
- Calibration profile cards:
  - Pixels per millimeter.
  - Source.
  - Timestamp or freshness where available.

### States

- No calibration profile.
- LiDAR profile.
- ArUco profile.
- Manual profile.
- Share/download error.

### Design Guidance

Calibration should be utilitarian. The marker must be easy to view or share. Profile information should be readable, but not over-explained.

### Must Preserve

- Marker access.
- Share/download behavior.
- Calibration source display.

## Journey 11: History

### Route

- `/more/history`

### User Goal

Find previous inspections, including synced, pending, and failed local records.

### Current Content

- Date range picker.
- Status filters:
  - All.
  - Today.
  - Synced.
  - Pending.
  - Failed.
- Grouped list:
  - Today.
  - Yesterday.
  - Earlier this week.
  - Earlier.
- Remote inspection rows.
- Local pending/failed queue rows.
- Sync status pill.

### Primary Actions

- Filter list.
- Change date range.
- Open synced inspection detail.
- Open pending inspection detail.
- Retry or resolve failed queue where available.

### States

- Loading.
- Empty history.
- No filtered results.
- Pending sync.
- Failed sync.
- Offline.

### Design Guidance

History is a search-and-recover surface. Use strong row hierarchy and clear sync badges. Pending and failed records must look different from completed records.

### Must Preserve

- Mixed remote and local queue entries.
- Date filtering.
- Status filtering.
- Pending detail route.

## Journey 12: Recordings

### Route

- `/more/recordings`

### User Goal

Review, share, save, delete, or retry inspection recordings.

### Current Content

- Recording list.
- Capture media preview.
- Duration filters:
  - All.
  - Short.
  - Long.
- Date range filter.
- Pending/offline recording queue rows.
- Share action.
- Save to Photos action.
- Delete action.
- Retry failed queue action.

### States

- Loading recordings.
- Empty recordings.
- Preview unavailable.
- Share unavailable.
- Save success.
- Save failed.
- Delete confirming.
- Pending upload.
- Failed upload.

### Design Guidance

Make recordings feel like media assets tied to inspections. The preview should be useful but not oversized. Actions should be predictable and safely separated from destructive delete.

### Must Preserve

- Filters.
- Preview.
- Share.
- Save to Photos.
- Delete.
- Retry failed queue.

## Journey 13: Reports And Export

### Route

- `/reports`

### User Goal

Summarize inspection performance over a period and export data.

### Current Content

- Date range filters:
  - Last 7 days.
  - Last 30 days.
  - Last 90 days.
  - Custom.
- Variety filter.
- KPI cards:
  - Inspections.
  - Total seeds.
  - Mean length.
  - Mean area.
- CSV export action through OS share sheet.
- Localized CSV headers.

### States

- Loading report.
- No data.
- Export preparing.
- Export success.
- Export failed.

### Design Guidance

Reports should feel concise and export-focused. Prioritize KPIs and filters. Avoid complex analytics unless the data already supports it.

### Must Preserve

- Date range filter.
- Variety filter.
- CSV export.
- Localized headers.

## Journey 14: Model Registry And Readiness

### Route

- `/more/models`

### User Goal

Install, activate, update, rollback, or delete the local model artifacts needed for capture.

### Current Content

- Production/Staging channel segmented control.
- Refresh candidates action.
- Auto-install on Wi-Fi toggle.
- Candidate model cards/rows.
- Active model status.
- Installed model status.
- Available model status.
- Unsupported model status.
- Install progress.
- Cancel install.
- Activate installed.
- Delete installed.
- Rollback to previous active.
- Fallback local/offline index state.

### States

- Loading registry.
- Offline registry fallback.
- No active model.
- Candidate available.
- Installing.
- Installed.
- Active.
- Unsupported.
- Failed install.
- Rollback available.

### Design Guidance

This page is technical but should still be understandable. Use clear status language and progress indicators. The active model should be unmistakable. Dangerous actions like delete should be visually separated.

### Must Preserve

- Channel switch.
- Install/activate/delete/rollback.
- Progress and cancel.
- Auto-install toggle.
- Capture gate dependency.

## Journey 15: Hyperparameters QA

### Route

- `/more/hyperparams`

### User Goal

Tune local inference behavior for QA without changing app architecture.

### Current Content

- Confidence threshold presets.
- NMS IoU threshold presets.
- Inference FPS presets.
- Morphology enhancement toggle.
- Inference timing histogram:
  - p50.
  - p95.
  - p99.
- Defaults/reset card.

### States

- Current values.
- Dirty values.
- Reset to defaults.
- Timing data unavailable.

### Design Guidance

This is an advanced operator tool. Use compact controls, clear current values, and reset affordance. Avoid making it look like a primary inspector workflow.

### Must Preserve

- All tuning controls.
- Timing display.
- Reset behavior.

## Journey 16: Notifications

### Routes

- `/notifications`
- `/notifications/[id]`

### User Goal

See operational messages, read details, and navigate to related content.

### Current Content

- Notification list.
- Mark all read action when unread exists.
- Notification types:
  - Success.
  - Info.
  - Warning.
  - Error.
- Unread dot.
- Timestamp.
- Detail card.
- Related content card when route exists.

### Primary Actions

- Open notification list from bell.
- Mark all read.
- Tap notification.
- Open related route.

### States

- Empty notifications.
- Unread.
- Read.
- Related route exists.
- Related content deleted or unavailable.

### Design Guidance

Notifications should be light and direct. Make severity visible but not noisy. Detail pages should clearly state what happened and what the user can do next.

### Must Preserve

- Modal presentation.
- Mark-read behavior.
- Related route navigation.

## Journey 17: More, Settings, Profile, And Account

### Routes

- `/(tabs)/more`
- `/settings`
- `/profile`

### More Menu Groups

- Account:
  - Profile.
  - Settings.
  - Sign out.
- Capture and model readiness:
  - Recordings.
  - History.
- Reference:
  - Varieties.
  - Calibration.
  - Model hyperparameters.
  - Model registry.
- Insights:
  - Reports.

### Settings Content

- Theme:
  - Light.
  - Dark.
  - System.
- Language:
  - English.
  - Thai.
- Sync status.
- Pending count.
- Failed count.
- Retry all.
- Clear failed.
- App version/build.

### Profile Content

- Full name.
- Email.
- Role badge.
- Role description.

### States

- Signing out.
- Sync idle.
- Sync pending.
- Sync failed.
- Retry in progress.
- Failed queue cleared.

### Design Guidance

More should be a clear control center. Keep groups short and scan-friendly. Settings should be a practical preferences and maintenance page. Profile is read-only and should stay simple.

### Must Preserve

- Menu structure.
- Sign out.
- Theme and language selection.
- Sync maintenance actions.
- Profile read-only behavior.

## Journey 18: Offline Sync

### System Surfaces

- Global sync queue worker.
- Home sync banner.
- Settings sync status.
- History pending/failed rows.
- Recordings pending/failed rows.
- Capture review offline queue fallback.
- Pending inspection detail route.

### User Goal

Continue working when network or upload fails, then recover without losing inspection records.

### Required Status Language

- Synced.
- Pending.
- Failed.
- Retrying.
- Offline.

### States

- Online and synced.
- Online with pending queue.
- Offline with pending queue.
- Failed queue items.
- Retry successful.
- Retry failed.

### Design Guidance

Offline sync should be visible only when useful. Do not make every screen look like a sync console. Failed and pending states need clear recovery actions.

### Must Preserve

- Queue fallback after save failure.
- Retry all.
- Clear failed.
- Pending/failed history visibility.

## Journey 19: Permissions, Access, Errors, Empty, And Loading

### Permission Cases

- Camera permission required.
- Microphone permission required for recording.
- Photo library permission required for saving media.
- Location permission optional through auto-tagging.

### Access Cases

- Admin-only variety editing.
- Inspector read-only reference browsing.
- Auth session required for main app.

### Error Cases

- Login failure.
- Model missing.
- Class alias missing.
- Calibration unavailable.
- Analyzer failure.
- Upload failure.
- Save failure.
- Export failure.
- Delete blocked by references.

### Empty Cases

- No inspections.
- No varieties matching search.
- No notifications.
- No recordings.
- No report data.
- No model candidates.

### Design Guidance

Create one consistent family for empty, loading, blocked, warning, and error states. Use direct next actions. Avoid long explanations unless the user cannot recover without details.

## Journey 20: Internationalization And Content

### Supported Languages

- English.
- Thai.

### Content Rules

- Preserve existing i18n keys where possible.
- Add keys only when new text is needed.
- Never introduce raw English strings directly in components.
- Thai content must remain structurally complete.
- Use concise field-operations language.

### Tone

Preferred:

- Direct.
- Operational.
- Confident.
- Short.

Avoid:

- Marketing claims.
- Long feature descriptions.
- Technical errors exposed without recovery action.
- Overly decorative page titles.

## Design Generator Prompt

Use this prompt with another design tool:

Redesign the Advance Seeds Field Inspector mobile app as a clean, modern field QA workspace. Preserve the existing product journey, routes, roles, data behavior, and actions. The app is used by inspectors and admins to capture seed samples, run live camera analysis, review detected seeds, manage seed variety reference data, install model artifacts, and export reports.

Design every screen as a real operational app, not a marketing site. Keep screens simple, scannable, and mobile-first. Use consistent typography, spacing, cards, controls, status badges, loading states, empty states, and error states. Avoid adding explanatory feature cards to operational pages. Keep the camera HUD function-first and do not add decorative layers over live video.

Required journeys: splash, welcome, login, Home dashboard, capture setup, live camera capture, processing, review/save/sync, inspection detail, seed detail, Varieties catalog, variety detail, admin reference list, variety editor, calibration, history, recordings, reports, model registry, hyperparameters, notifications, More, settings, profile, and offline sync recovery.

Primary product concepts to preserve: inspection pulse, selected variety, model readiness, calibration readiness, ROI, live detections, grade A/B/C/reject, seed measurements, synced records, pending queue, failed queue, active/inactive varieties, admin-only editing, English/Thai language support, and CSV/media export.

The output should include screen-by-screen designs, component rules, spacing and sizing rules, state variants, and mobile interaction notes. Keep the design elegant and easy to use, with enough detail for implementation.

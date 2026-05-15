# Model Registry Detail Screen and UI Polish

## User-Visible Outcome

Operators tap any model card in More → Model registry to drill into a dedicated detail screen that shows the full metadata (Performance / Model / Training / Artifact) instead of an inline expand-panel. Available registry candidates are inspectable before install — the same detail surface, with the bottom action swapping from Delete to Install. Reinstalling the app on iOS no longer wedges inspection into a permanent "Model readiness required" state when registry artifacts already exist on disk. A handful of cross-app design-cleanup tasks land alongside (Settings title + sync button colors, More-tab profile-card removal, Reports variety dropdown converted to the shared sheet primitive, Recordings + Calibration action-row cleanup, Varieties tab search redesign + detail Grade thresholds wired to the configured `grade_criteria`).

## What Changes

- Replace the in-place `ModelDetails` expand panel on the registry list with a new route `/more/models/[id]`. Each card becomes a tappable navigation row with a trailing chevron-right; unsupported cards stay non-tappable. Inline action buttons remain only for non-active states (`Install`, `Activate` / `Restore`, `Cancel`). The active model is only manageable from its detail screen.
- New detail screen renders a hero card (with a 2-px green left-rail accent when active), a 3-up KPI strip (`ACC / MAP / SIZE`), and sectioned KV cards (Performance / Model / Training / Artifact). It reads from `InstalledModelRecord` when the id is installed, and falls back to a registry candidate lookup (`listDeployedModelCandidates` across both channels, with a channel-prefix shortcut) when the id is only available. The bottom action toggles between `Delete this model` (installed) and `Install` (candidate).
- Add a shared `<KV>` row component (`apps/mobile/components/ui/KV.tsx`) and a small string helper module (`apps/mobile/lib/strings.ts`) holding `truncateMiddle` + a hardened `formatPrimitive`.
- Fix the reinstall-blocks-inspection bug: `readInstalledModels` / `readActiveModel` / `readPreviousActiveModel` re-anchor stored absolute artifact URIs against the current `FileSystem.documentDirectory` so a rotated container UUID doesn't strand the gate at `"missing"` when the files still exist on disk.
- Fix a latent Rules-of-Hooks violation in `apps/mobile/app/capture/scan.tsx`: the `recDurationLabel` `useMemo` lived below the model-readiness / LiDAR-calibration early returns, so React raised `"Rendered more hooks than during the previous render"` once LiDAR calibration completed and the render path widened. Surfaced by the path-staleness fix making the gate transition faster.
- Adjust the `ghostDanger` Button variant to use a visible at-rest pink fill (`bg-danger-bg`) that darkens on press, matching the destructive-action language used elsewhere.
- Set the Settings AppTopBar title to `t("settings:title")`. Swap the Sync row's Retry all to `primary` and Clear failed to `ghostDanger`.
- Remove the duplicated profile card from the top of the More tab (Account → Profile row already exists).
- Replace the inline-expand variety filter on Reports with the shared `DropdownSearch` modal sheet so every dropdown in the app uses the same primitive.
- Recordings cards: shorten "Share recording" / "Save recording" labels to "Share" / "Save" in EN + TH, and add a visible red "Delete" label next to the trash icon.
- Calibration: remove the redundant Share button (it shared a handler with Save PDF) and let Save PDF span full width.
- Varieties tab: drop the top-right Search icon from the AppTopBar; redesign the search input to mirror the More-menu Varieties pattern (h-11, hairline border, `autoCapitalize="none"`). On the detail page, remove the admin-only "Edit variety" / "Capture classes" buttons (the AppTopBar pencil shortcut still exposes admin edit). Rewire the Grade thresholds card to display real `variety.grade_criteria` ranges (length + width, with a "Not configured" fallback per missing grade), and drop the trailing ChevronRight from each threshold row.
- Add EN + TH i18n keys for the new model-registry detail surface, the recordings/varieties renames, and the `gradeNotSet` fallback.

## Non-Goals

- No change to the install pipeline (download → SHA-256 → smoke-load → activation) beyond the read-time path re-anchoring.
- No `model_events` table or activation-history surface (the detail screen's "Activation history" section is deferred).
- No real wiring of Re-verify / Copy ID actions — they were no-op scaffolds and have been removed from the UI.
- No change to inspection capture, calibration math, sync queue, or Supabase schema.
- No rename of the existing `more.json` key `models.previousPill` (the value flipped from "Previously active" to "Rollback"; the key path is unchanged).

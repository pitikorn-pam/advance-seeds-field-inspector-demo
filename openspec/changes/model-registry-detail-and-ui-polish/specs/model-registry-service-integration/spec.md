# Model Registry Service Integration — Delta

This delta MODIFIES the active `model-registry-service-integration` capability by adding two new requirements (model detail surface + read-time path re-anchoring) and clarifying the list-screen interaction model.

## ADDED Requirements

### Requirement: Model detail surface
The mobile app SHALL expose a dedicated detail surface for every model the user can reach from the registry list — installed, active, rollback, available, and installing — at a per-model route, separate from the registry list.

#### Scenario: Drill into an installed model
- **GIVEN** the user is on More → Model registry
- **AND** at least one installed model exists in `registry.json`
- **WHEN** the user taps an installed (or active, or rollback) card
- **THEN** the app SHALL navigate to `/more/models/<id>`
- **AND** the detail screen SHALL render Performance / Model / Training / Artifact sections sourced from the installed record's metadata
- **AND** the bottom action SHALL be a single destructive `Delete this model` button wired to the existing `deleteInstalledModel` flow

#### Scenario: Drill into an available candidate
- **GIVEN** a registry candidate is listed but not yet installed locally
- **WHEN** the user taps the available card
- **THEN** the app SHALL look the id up across the production and staging candidate lists
- **AND** SHALL render the same Performance / Model / Training / Artifact view sourced from the candidate metadata + artifact manifest
- **AND** the bottom action SHALL be a single `Install` button wired to the existing `installCandidate` + `activateInstalledModel` flow
- **AND** SHALL navigate back to the list once installation completes

#### Scenario: Active card on the list is non-actionable
- **GIVEN** an active model is shown in the registry list
- **WHEN** the user views the list
- **THEN** the active card SHALL render with a 2-px green left-rail accent
- **AND** SHALL NOT expose an inline action button
- **AND** SHALL be tappable as a navigation row whose only destination is `/more/models/<id>`

### Requirement: Read-time artifact path re-anchoring
The mobile app SHALL re-anchor stored artifact URIs against the current `FileSystem.documentDirectory` whenever it reads an installed-model record, so that a rotated container path does not strand the inspection gate at `"missing"` while the on-disk artifacts are still present.

#### Scenario: Container UUID rotates between launches
- **GIVEN** an installed `InstalledModelRecord` whose `artifactUri` and `compiledArtifactUri` were baked at install time under an old absolute container path
- **AND** the on-disk artifact files exist under the current `${documentDirectory}/models/<id>/` layout
- **WHEN** `readInstalledModels`, `readActiveModel`, or `readPreviousActiveModel` deserialize the record
- **THEN** any URI whose prefix does not match the current per-id install directory SHALL be rewritten to use the current install directory
- **AND** the rewritten URIs SHALL preserve the trailing suffix (`model.mlpackage.zip`, `model.tflite`, `model.mlmodelc/`)
- **AND** subsequent `quickVerifyArtifact` calls SHALL operate on the rewritten URIs

#### Scenario: Reinstall does not block capture
- **GIVEN** an inspection-ready model was installed and activated on a prior app build
- **AND** the device is reinstalled or rebuilt such that `FileSystem.documentDirectory` reports a new absolute path while preserving the documents container contents
- **WHEN** the inspector opens live or precise capture
- **THEN** the inspection gate SHALL find the active model usable
- **AND** the app SHALL NOT show a "Model readiness required" alert

## MODIFIED Requirements

### Requirement: Activation and rollback
The mobile app SHALL keep an on-device registry of installed artifacts and preserve the previous active model for rollback. **Activation and rollback are exposed only through the per-model detail surface for active records, and through inline buttons on the registry list for non-active records.**

#### Scenario: Activate installed model
- **GIVEN** an installed (non-active) model is shown on the registry list
- **WHEN** the user taps the inline `Activate` (or `Restore`, when the record is the previous-active rollback target) button
- **THEN** the app SHALL write `active-model.json`
- **AND** the app SHALL write the prior active model to `previous-active-model.json`
- **AND** analyzer selection SHALL prefer the active installed model on the next load

#### Scenario: Roll back to previous active model
- **GIVEN** `previous-active-model.json` exists and is surfaced as the inline rollback row
- **WHEN** the user taps `Restore` on the rollback row
- **THEN** the app SHALL restore the previous model as active
- **AND** analyzer selection SHALL use the restored artifact

## Implementation Notes

- `apps/mobile/app/more/models/[id].tsx` is the detail route. It loads via a unified `DetailView` view-model and `toDetailView` adapter (installed → `InstalledModelRecord`; available → `ModelCandidate`).
- Channel lookup for available candidates uses `listDeployedModelCandidates` and exploits the `${channel}-…` prefix on the id when present (single-channel fetch) before falling back to both channels.
- `apps/mobile/components/ui/KV.tsx` is the shared label/value row used by the detail screen; it uses an explicit `isLast` prop because NativeWind's `last:` modifier is unreliable on this stack.
- The re-anchor helper in `apps/mobile/lib/models/modelStore.ts` keys off the marker `/models/${encodeURIComponent(record.id)}/` inside the stored URI; everything before that marker is replaced with the current `documentDirectory`.

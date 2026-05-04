# Model Registry Service Integration

## Purpose
Mobile consumes the model registry service to list, download, validate, install, activate, and roll back TFLite (Android) and Core ML (iOS) model artifacts without embedding service-role or R2 credentials.

## Requirements
### Requirement: Registry service listing
The mobile app SHALL list deployed model candidates for staging and production channels through the public model registry service boundary.

#### Scenario: List candidates from dashboard
- **GIVEN** Supabase public environment variables are configured
- **WHEN** the user refreshes More -> Model registry for staging or production
- **THEN** the app SHALL call `listDeployedModelCandidates({ channel })`
- **AND** the screen SHALL display the returned candidates

### Requirement: Default model resolution
The mobile app SHALL probe the registry service for the default model after startup without blocking the Home screen's first paint.

#### Scenario: Resolve channel update probe
- **GIVEN** the app has a current active model version
- **WHEN** analyzer resolution runs after startup
- **THEN** the app SHALL call `resolveDefaultModel` with `currentVersion` and `currentCompat`
- **AND** the app SHALL log the response for diagnostics

### Requirement: Android TFLite installation
The mobile app SHALL install Android `.tflite` artifacts from registry candidates with download progress, hash validation, smoke-load validation, and local registry persistence.

#### Scenario: Install Android TFLite candidate
- **GIVEN** a TFLite candidate exists in the registry index
- **WHEN** the user installs it
- **THEN** the app SHALL download the `.tflite` with progress
- **AND** the app SHALL verify SHA-256
- **AND** the app SHALL smoke-load the model with `react-native-fast-tflite`
- **AND** the app SHALL store the artifact under `models/<id>/`
- **AND** the app SHALL record the model in `registry.json`
- **AND** activation SHALL prefer the installed artifact for live inference

### Requirement: iOS Core ML installation
The mobile app SHALL install iOS `.mlpackage.zip` artifacts from registry candidates with download progress, hash validation, extraction, Core ML compilation, smoke-load validation, and local registry persistence.

#### Scenario: Install iOS Core ML candidate
- **GIVEN** an `.mlpackage.zip` candidate exists in the registry index
- **WHEN** the user installs it
- **THEN** the app SHALL download the package with progress
- **AND** the app SHALL verify SHA-256
- **AND** the app SHALL extract the package
- **AND** the app SHALL compile it to `.mlmodelc`
- **AND** the app SHALL smoke-load the compiled model
- **AND** the app SHALL store the compiled model under `models/<id>/`
- **AND** the app SHALL record the model in `registry.json`

### Requirement: Install cancellation
The mobile app SHALL allow a user to cancel a running model install and clean up partial files.

#### Scenario: Cancel install
- **GIVEN** a model artifact download is in progress
- **WHEN** the user taps Cancel
- **THEN** the running download SHALL be cancelled
- **AND** partial files SHALL be removed
- **AND** the UI SHALL return to idle

### Requirement: Activation and rollback
The mobile app SHALL keep an on-device registry of installed artifacts and preserve the previous active model for rollback.

#### Scenario: Activate installed model
- **GIVEN** an installed model has passed compatibility validation and smoke-load validation
- **WHEN** the user activates it
- **THEN** the app SHALL write `active-model.json`
- **AND** the app SHALL write the prior active model to `previous-active-model.json`
- **AND** analyzer selection SHALL prefer the active installed model on the next load

#### Scenario: Roll back to previous active model
- **GIVEN** `previous-active-model.json` exists
- **WHEN** the user rolls back from More -> Model registry
- **THEN** the app SHALL restore the previous model as active
- **AND** analyzer selection SHALL use the restored artifact

### Requirement: Local fallback
The mobile app SHALL keep a manual index URL fallback for local or offline model testing.

#### Scenario: Install from local model index
- **GIVEN** a developer configures a local model index URL
- **WHEN** the registry service is unavailable or local testing is requested
- **THEN** the app SHALL parse the local index and manifest
- **AND** the same install, verification, activation, and rollback rules SHALL apply

## Implementation Notes

- Use `FileSystem.createDownloadResumable` for download progress + cancellation.
- Use SHA-256 verification of base64-encoded artifact as recorded in manifest. Hashing is done in pure JS (`lib/models/sha256.ts`); the previously-attempted `expo-crypto.digestStringAsync` path was reverted because it hashes the base64 string itself, not the decoded bytes.
- iOS: extract `.mlpackage.zip` then call `CoreMLRunner.compileModelPackage()` then smoke-load via `CoreMLRunner.loadModelAtPath()`.
- Android: smoke-load via `react-native-fast-tflite` using `loadTensorflowModel({ url })`.
- Maintain `active-model.json` and `previous-active-model.json` for safe rollback.
- Variety -> model class translation lives in `mapClassFilterForModel`. Tier 1 is operator-curated `varieties.model_class_aliases` (chip selector in the variety editor sources from the active model's `class_names`). Tier 2 is variety-name substring match. Tier 3 is the legacy COCO-synonym fallback into the model's 0-based class space.
- iOS frame-processor plugin selects the detection output by **shape signature** `[1, 300, 6 | ≥38]`, not by element count — picking the largest tensor returned the segmentation mask prototype `[1, 32, 160, 160]` instead of detections.
- Hot-path artifact verify uses `quickVerifyArtifact` (existence + size only). Full SHA-256 verify (`verifyInstalledArtifact`) runs only at install / activate to avoid blocking Home cold start.

## Tests / QA Matrix

- Android: install staging TFLite → activate → live capture
- iOS: install staging Core ML → compile → activate → live capture
- Rollback: activate new model → capture → rollback → verify previous active
- Offline: install from local HTTP index → verify offline use

## Docs / Runbook

- Operator: how to deploy model to staging/production
- Developer: how to create a local model index for testing
- Troubleshooting: steps for SHA-256 mismatch, smoke-load failures, and long Core ML compile times

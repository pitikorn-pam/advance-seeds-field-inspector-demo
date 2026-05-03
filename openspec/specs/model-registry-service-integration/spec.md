# Model Registry Service Integration

## Summary

Mobile shall consume a model registry service to list, download, validate, install, and activate TFLite (Android) and Core ML (iOS) model artifacts. The mobile app keeps a manual index URL fallback for local or offline testing and maintains an on-device registry of installed artifacts with activation and rollback semantics.

## Service Boundary

Mobile APIs (in `apps/mobile/lib/models/registryService.ts`):

- `listDeployedModelCandidates({ channel })`
- `resolveDefaultModel({ channel, currentVersion, currentCompat })`
- `listDeployedModelsUrl(...)`
- `resolveDefaultModelUrl(...)`

Low-level installer (in `apps/mobile/lib/models/modelRegistry.ts`) handles:
- parsing index/manifest
- download + SHA-256 verification
- iOS `.mlpackage.zip` extraction + compile to `.mlmodelc`
- Android `.tflite` download + smoke-load test
- writing `registry.json`, `active-model.json`, `previous-active-model.json`

Mobile must not embed service-role or R2 credentials; it uses the public Supabase anon key only for those functions that accept it.

## Runtime Flow

1. Operator deploys model(s) to the ML dashboard (staging/production channels).
2. User opens More → Model registry in the mobile app.
3. The screen calls `listDeployedModelCandidates()` for the selected channel.
4. User taps Install on a candidate.
5. The app downloads the artifact, verifies SHA-256, validates metadata compatibility, smoke-loads the model, and installs it into app document storage.
6. Activation writes `active-model.json`; previous active saved to `previous-active-model.json` for rollback.
7. On startup, analyzer selection prefers the active installed model and falls back to bundled weights or classical analyzer.

## Acceptance Criteria / Scenarios

- Scenario: List candidates from dashboard
  - GIVEN Supabase public env vars are configured
  - WHEN the user refreshes More → Model registry for staging or production
  - THEN the app shall call `list-deployed-models` and display returned candidates

- Scenario: Install Android TFLite candidate
  - GIVEN a TFLite candidate exists in the index
  - WHEN the user installs it
  - THEN the app downloads the `.tflite` with progress, verifies SHA-256, smoke-loads it, stores under `models/<id>/`, and records it in `registry.json`
  - AND activation prefers installed artifact for live inference

- Scenario: Install iOS Core ML candidate
  - GIVEN an `.mlpackage.zip` is available
  - WHEN the user installs it
  - THEN the app downloads the package with progress, verifies SHA-256, extracts, compiles to `.mlmodelc`, smoke-loads, stores under `models/<id>/`, and records in `registry.json`

- Scenario: Cancel install
  - GIVEN a download is in progress
  - WHEN the user taps Cancel
  - THEN the running download is cancelled, partial files are removed, and the UI returns to idle

- Scenario: resolve-channel update probe
  - GIVEN the app has a current active version
  - WHEN the app starts
  - THEN it SHALL call `resolveDefaultModel` with `currentVersion` and `currentCompat` and log the response

## Implementation Notes

- Use `FileSystem.createDownloadResumable` for download progress + cancellation.
- Use SHA-256 verification of base64-encoded artifact as recorded in manifest.
- iOS: extract `.mlpackage.zip` then call `CoreMLRunner.compileModelPackage()` then smoke-load via `CoreMLRunner.loadModelAtPath()`.
- Android: smoke-load via `react-native-fast-tflite` using `loadTensorflowModel({ url })`.
- Maintain `active-model.json` and `previous-active-model.json` for safe rollback.

## Tests / QA Matrix

- Android: install staging TFLite → activate → live capture
- iOS: install staging Core ML → compile → activate → live capture
- Rollback: activate new model → capture → rollback → verify previous active
- Offline: install from local HTTP index → verify offline use

## Docs / Runbook

- Operator: how to deploy model to staging/production
- Developer: how to create a local model index for testing
- Troubleshooting: steps for SHA-256 mismatch, smoke-load failures, and long Core ML compile times

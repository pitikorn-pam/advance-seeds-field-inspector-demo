# Model Registry Service Integration

The mobile app consumes deployed models from the dashboard service owned by
`advance-seeds-field-inspector-ml`.

## Service Boundary

Mobile code should use:

- `apps/mobile/lib/models/registryService.ts`
  - `listDeployedModelCandidates({ channel })`
  - `resolveDefaultModel({ channel, currentVersion, currentCompat })`
  - `listDeployedModelsUrl(...)`
  - `resolveDefaultModelUrl(...)`

The lower-level installer remains in:

- `apps/mobile/lib/models/modelRegistry.ts`
  - parses service responses or local HTTP model indexes
  - installs Android `.tflite`
  - installs iOS `.mlpackage.zip` by extracting, compiling to `.mlmodelc`,
    smoke-loading, and storing the compiled path

## Dashboard Endpoints

The service wrapper targets the Supabase Edge Functions exposed by the ML repo:

- List selectable deployed models:
  `/functions/v1/list-deployed-models?model_line=seeds-poc&channel=production&platform=android`
- Resolve the default channel model:
  `/functions/v1/resolve-channel?model_line=seeds-poc&channel=production&platform=android&current_version=&current_compat=`

Both use the app's public Supabase anon key from `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
Do not add service-role or R2 credentials to the mobile app.

## Runtime Flow

1. Operator deploys one or more model versions from the dashboard.
2. Mobile opens More -> Model registry.
3. The selected channel calls `listDeployedModelCandidates`.
4. User installs a candidate.
5. Install verifies SHA-256 and metadata compatibility.
6. Android smoke-loads TFLite; iOS compiles and smoke-loads Core ML.
7. Activation writes `active-model.json`.
8. Analyzer startup and live inference require the active installed model. If
   the artifact is missing or invalid, capture shows the model-required state
   and analysis does not fall back to bundled weights.

## Packaging Rule

The base mobile app must not ship app-owned detector binaries. Keep
`assets/models/*.tflite`, compiled `.mlmodelc` outputs, podspec resource
entries, Gradle resource source sets, and Metro `.tflite` asset rules out of
the release package. Models are installed later through the registry flow above.

Android APK inspection may still show third-party dependency models, for
example MLKit barcode `.tflite` assets. Those are not the seed detector.

## Current Smoke Result

On 2026-05-03, the live dashboard service returned:

- `production/android`: 1 ready default model
- `production/ios`: 1 ready default model
- `staging/android`: 0 models
- `staging/ios`: 0 models

Staging will stay empty in the app until a model is deployed to staging.

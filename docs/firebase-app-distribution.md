# Firebase App Distribution — setup + ongoing flow

Pilot distribution channel for the Advance Seeds Field Inspector mobile
preview build. Testers get an email invite, install in two taps, get notified
on every new APK upload. Free; no Play Console required.

## One-time setup

### 1. Create the Firebase project (web console, ~5 min)

1. https://console.firebase.google.com → **Add project** → name it
   `Advance Seeds Field Inspector` (or join an existing project if your team
   already has one).
2. Skip Google Analytics (App Distribution doesn't need it).
3. In the project → **Add app** → Android → register with package id
   `com.advanceseeds.fieldinspector`. The "App nickname" can be `Mobile preview`.
4. **You can skip the `google-services.json` download step** — the app
   doesn't currently use any other Firebase SDK (Analytics / Auth / Crashlytics),
   so we don't need that file in the build.
5. Project settings → **Your apps** → Android app → copy the **App ID**
   (looks like `1:123456789012:android:abcdef0123456789`).

### 2. Add the App ID to your local env

```bash
echo 'FIREBASE_ANDROID_APP_ID=1:123456789012:android:abcdef0123456789' \
  >> apps/mobile/.env
```

(Don't commit this; `.env` is gitignored.)

### 3. Install + log in to firebase-tools (one-off per dev machine)

```bash
npm install -g firebase-tools
firebase login
```

Authenticates against your Google account; the CLI now has permission to
publish to App Distribution for any project that account is a member of.

### 4. Create a tester group

Firebase Console → **App Distribution** → **Testers & Groups** → **Add group**:

- alias `internal` — engineering / QA accounts
- (optional) alias `pilot` — pilot users (Jane, Alex)

Add tester emails to each group. Testers receive an invite email the first
time you publish a build to their group.

## Ongoing flow

### Local Android release build (preferred for this repo)

Use this path when an Android-only tester build is needed and you do not want
to spend an EAS cloud build.

```bash
# 1. Sync native metadata if app.json changed, then build locally.
cd apps/mobile
pnpm exec expo prebuild --platform android --no-install
pnpm run build:preview:android:local

# 2. Distribute the generated APK to the internal group.
FIREBASE_APK_PATH=android/app/build/outputs/apk/release/app-release.apk \
  pnpm run dist:android

# 3. Promote the same APK to the pilot group when ready.
FIREBASE_APK_PATH=android/app/build/outputs/apk/release/app-release.apk \
  FIREBASE_GROUPS=pilot \
  pnpm run dist:android
```

`build:preview:android:local` patches the generated Gradle metaspace cap before
running `:app:assembleRelease`; the release graph otherwise can fail during
`:app:compileReleaseKotlin` with `Metaspace`.

### EAS Android release build

Use this only when a cloud-built artifact is explicitly desired.

```bash
# 1. Build a fresh preview APK on EAS (~10-15 min, runs in cloud).
pnpm -F @advance-seeds/mobile build:preview:android

# 2. Distribute the latest finished build to the `internal` group.
#    (Wait until step 1 finishes; the script reads from EAS build:list.)
pnpm -F @advance-seeds/mobile dist:android

# 3. Promote the same APK to the pilot group when ready.
FIREBASE_GROUPS=pilot pnpm -F @advance-seeds/mobile dist:android
```

> **Note:** `FIREBASE_GROUPS` must match an existing group **alias** (lowercase
> identifier, not display name) under Firebase Console → App Distribution →
> Testers & groups. A missing alias surfaces as `HTTP 404, Requested entity
was not found` _after_ the APK uploads. List existing aliases with
> `firebase appdistribution:group:list --project advance-seeds-field-inspector`.

Testers get an email link; tapping it opens the Firebase App Tester app,
which installs the APK with one confirmation.

### Updating an existing install

Subsequent builds installed via App Distribution get an in-app
update prompt — testers don't need to reinstall manually. Firebase deduplicates
the same APK signature, so the same Android keystore (managed by EAS
automatically — see `eas credentials`) is reused across builds.

## OTA updates without a fresh native build

If a change is JS-only, you can push it to existing installs in ~30 s instead
of waiting on a 15-minute native build:

```bash
cd apps/mobile && eas update --branch preview --message "fix: <summary>"
```

The dev client + preview APK both subscribe to the `preview` channel
(see `eas.json`), so the next time the app cold-starts it pulls the new bundle.

Limitation: `eas update` cannot ship native code changes (Kotlin / Obj-C /
podspec / app.json plugin list edits). For those, rebuild + redistribute.

## Troubleshooting

- **"No finished EAS Android preview builds found"** in the dist script — run
  `eas build:list --platform android --profile preview --limit 5` to see the
  state. If the most recent is `IN_PROGRESS`, wait for it.
- **Tester reports "App not installed"** — the EAS auto-managed keystore
  changed. Run `eas credentials` → Android → check that there's only one
  active keystore. The fix is to publish a new build with the canonical
  keystore and have the tester uninstall the old version once.
- **`firebase: command not found`** — the install step (`npm i -g firebase-tools`)
  needs `sudo` on system Node, or use `pnpm dlx firebase-tools` per call.

# mobile-distribution Specification

## Purpose
EAS Build profiles and Firebase App Distribution for iOS and Android internal testers.

## Requirements
### Requirement: EAS Build configuration with three profiles
The mobile app SHALL configure EAS Build with `development`, `preview`, and `production` profiles in `apps/mobile/eas.json`.

#### Scenario: development profile produces a dev-client build
- **WHEN** a developer runs `eas build --profile development --platform ios`
- **THEN** EAS Build produces an iOS dev client `.ipa` installable via Apple Configurator or Firebase
- **AND** the build includes the dev menu and Metro bundler connection

#### Scenario: preview profile produces internal-distribution builds
- **WHEN** a maintainer runs `eas build --profile preview --platform ios`
- **THEN** EAS Build produces a signed `.ipa` ready for Firebase App Distribution upload
- **AND** the same flag for Android produces a signed `.apk` ready for Firebase App Distribution upload

### Requirement: Firebase App Distribution for iOS internal testers
The mobile app SHALL be distributable to invited iOS testers via Firebase App Distribution (NOT TestFlight). Apple Developer Program enrollment is still required for signing.

#### Scenario: Tester accepts Firebase invite and installs on iPhone
- **GIVEN** a tester's email has been added to a Firebase App Distribution group
- **WHEN** they accept the email invite, install the Firebase iOS install profile, and tap Install on the build page
- **THEN** the latest `preview` build runs on their device
- **AND** the app reaches the Supabase backend successfully
- **AND** no TestFlight account or Apple ID review is required

#### Scenario: Apple Developer cert is the signing dependency
- **GIVEN** EAS-managed credentials are configured with the team's Apple Developer account
- **WHEN** `eas build --profile preview --platform ios` runs
- **THEN** the build is signed with a valid distribution cert
- **AND** Firebase accepts the upload without re-signing

### Requirement: Firebase App Distribution for Android internal testers
The mobile app SHALL be distributable to invited Android testers via Firebase App Distribution. Google Play Console enrollment is NOT required.

#### Scenario: Tester accepts invite and installs on Z Flip 7 FE
- **WHEN** a tester accepts the Firebase email invite, taps the install link, and toggles "install from unknown sources" once
- **THEN** the APK installs and runs
- **AND** the app reaches the Supabase backend successfully

### Requirement: Distribution docs replace Expo Go references
The repository's mobile-related docs SHALL replace every Expo Go QR reference with Firebase App Distribution invite instructions.

#### Scenario: README mobile section is current
- **WHEN** a reader opens the root `README.md`
- **THEN** the mobile section explains Firebase App Distribution invite acceptance for both platforms
- **AND** does not reference Expo Go QR scanning except as a historical note

#### Scenario: Demo script mobile section is current
- **WHEN** a presenter follows `docs/demo-script.md` Stage 1
- **THEN** the steps describe Firebase invite install (not Expo Go QR)
- **AND** the recovery playbook covers Firebase-specific failure modes (invite rejected, install profile expired, unknown-sources prompt declined)

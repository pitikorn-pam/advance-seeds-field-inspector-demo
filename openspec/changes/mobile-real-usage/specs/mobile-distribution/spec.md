# Spec — mobile-distribution

## ADDED Requirements

### Requirement: EAS Build configuration with three profiles
The mobile app SHALL configure EAS Build with `development`, `preview`, and `production` profiles in `apps/mobile/eas.json`.

#### Scenario: development profile produces a dev-client build
- **WHEN** a developer runs `eas build --profile development --platform ios`
- **THEN** EAS Build produces an iOS dev client `.ipa` installable via Apple Configurator or TestFlight internal channel
- **AND** the build includes the dev menu and Metro bundler connection

#### Scenario: preview profile produces internal-distribution builds
- **WHEN** a maintainer runs `eas build --profile preview --platform ios`
- **THEN** EAS Build produces a TestFlight-ready `.ipa` signed with the team's Apple Developer credentials
- **AND** the same flag for Android produces a signed `.apk` downloadable from the EAS build page

### Requirement: TestFlight distribution for iOS internal testers
The mobile app SHALL be distributable via TestFlight to invited internal testers without App Store review.

#### Scenario: Tester accepts invite and installs
- **GIVEN** a tester's email has been added to the App Store Connect internal testing group
- **WHEN** they accept the TestFlight invite and install via the TestFlight app
- **THEN** the latest `preview` build runs on their device
- **AND** the app reaches the Supabase backend successfully

### Requirement: APK distribution for Android internal testers
The mobile app SHALL be distributable as a signed APK to Android testers via a download link or Google Play internal track.

#### Scenario: APK install via download link
- **WHEN** a tester downloads the APK from the EAS build page
- **THEN** they can install it after enabling "Install from unknown sources" for the browser
- **AND** the app launches and reaches the Supabase backend

### Requirement: Distribution docs replace Expo Go references
The repository's mobile-related docs SHALL replace every Expo Go QR reference with TestFlight + APK install instructions.

#### Scenario: README mobile section is current
- **WHEN** a reader opens the root `README.md`
- **THEN** the mobile section explains TestFlight invite acceptance and APK sideload
- **AND** does not reference Expo Go QR scanning except as a historical note

#### Scenario: Demo script mobile section is current
- **WHEN** a presenter follows `docs/demo-script.md` Stage 1
- **THEN** the steps describe TestFlight install (not Expo Go QR)
- **AND** the recovery playbook covers TestFlight-specific failure modes (build expired, tester invite rejected)

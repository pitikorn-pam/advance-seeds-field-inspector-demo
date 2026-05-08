# mobile-onboarding Specification

## Purpose
First-launch splash, welcome carousel, and camera permission request before first capture.

## Requirements
### Requirement: Splash screen on every launch
The mobile app SHALL show a 1.5-second splash screen on every launch with the brand mark on a brand-tinted background.

#### Scenario: Cold launch shows splash
- **WHEN** the user opens the app from a cold start
- **THEN** the splash screen renders for ~1.5 seconds
- **AND** then routes to the welcome screen on first launch or to the auth gate on subsequent launches

### Requirement: Welcome onboarding on first launch
The mobile app SHALL show a 3-card welcome screen on the user's first launch only, reflecting the current unified capture, adaptive calibration, configured grading, and model-sync behavior.

#### Scenario: First launch shows welcome
- **GIVEN** AsyncStorage key `as.mobile.onboarded` is unset
- **WHEN** the splash screen finishes
- **THEN** the welcome screen renders with three cards (Camera, Target, Sync) explaining sampled YOLO26 inference, adaptive LiDAR/ArUco calibration, and cloud sync
- **AND** a "Continue" button on the third card sets `as.mobile.onboarded = true` and routes to permission requests

#### Scenario: Subsequent launches skip welcome
- **GIVEN** `as.mobile.onboarded = true`
- **WHEN** the splash screen finishes
- **THEN** the welcome screen is NOT shown
- **AND** the user lands on the auth gate directly

### Requirement: Camera permission request before first capture
The mobile app SHALL request camera permission as part of the onboarding flow on first launch and again the first time the user attempts a capture if it was previously denied.

#### Scenario: Permission granted continues to login
- **WHEN** the user taps "Allow" on the camera permission prompt
- **THEN** the prompt closes and the user is routed to login

#### Scenario: Permission denied surfaces an explanatory screen
- **WHEN** the user taps "Don't Allow"
- **THEN** a screen renders explaining that capture won't work without camera access, with a button that deep-links to the OS Settings page for the app

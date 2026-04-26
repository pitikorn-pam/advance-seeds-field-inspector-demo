# authentication Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: Email and password sign-in
Both the dashboard and the mobile app SHALL allow a user to sign in with email and password using Supabase Auth.

#### Scenario: Valid credentials sign in to dashboard
- **GIVEN** the dashboard login screen is open
- **WHEN** the user enters `jane@advanceseeds.com` and the correct password and submits
- **THEN** they are redirected to the home screen and a session is persisted in localStorage

#### Scenario: Valid credentials sign in to mobile
- **GIVEN** the mobile login screen is open
- **WHEN** the user enters `jane@advanceseeds.com` and the correct password and taps "Sign in"
- **THEN** they are routed to the home tab and the session is persisted in AsyncStorage

#### Scenario: Invalid credentials show inline error
- **WHEN** the user submits the wrong password
- **THEN** an inline error appears below the form and no navigation occurs

### Requirement: Session persistence and auto sign-in
The applications SHALL persist the Supabase session and auto sign-in on next launch until the user signs out or the session expires.

#### Scenario: Reload does not require re-auth
- **GIVEN** the user is signed in
- **WHEN** they reload the dashboard or relaunch the mobile app
- **THEN** they land on the home screen without re-entering credentials

### Requirement: Sign-out clears session
The applications SHALL provide a sign-out action that clears the persisted session and returns the user to the login screen.

#### Scenario: Sign-out from settings
- **WHEN** the user taps "Sign out" from Settings
- **THEN** the persisted session is cleared and the next protected route redirects to login

### Requirement: Role-based UI gating
The applications SHALL hide admin-only actions from inspectors and SHALL still rely on RLS as the security boundary.

#### Scenario: Inspector cannot see "Create variety" button
- **GIVEN** Jane is signed in
- **WHEN** she opens the Varieties screen
- **THEN** the create / edit / delete controls are not rendered

#### Scenario: Admin sees full controls
- **GIVEN** Alex is signed in
- **WHEN** he opens the Varieties screen
- **THEN** the create / edit / delete controls are visible


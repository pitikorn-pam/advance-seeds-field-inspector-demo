# web-dashboard-deployment Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: GitHub Pages deploy on merge to main
The repository SHALL include a GitHub Actions workflow that builds `apps/dashboard` and publishes the `dist/` directory to the `gh-pages` branch on every push to `main`.

#### Scenario: Merge triggers deploy
- **GIVEN** the workflow file exists at `.github/workflows/deploy-dashboard.yml`
- **WHEN** a PR is merged to `main`
- **THEN** the workflow runs to completion and `gh-pages` branch is updated with the new `dist/`

#### Scenario: Deployed URL serves the app
- **WHEN** a visitor opens `https://<owner>.github.io/advance-seeds-field-inspector-demo/`
- **THEN** the dashboard login screen renders without 404

### Requirement: Base path consistency
The Vite build base and the React Router basename SHALL both equal `/advance-seeds-field-inspector-demo/`.

#### Scenario: Deep link works after reload
- **WHEN** a user navigates to `https://<owner>.github.io/advance-seeds-field-inspector-demo/inspections` and reloads the page
- **THEN** the inspections screen renders (not a GitHub 404)

### Requirement: PR build verification
The repository SHALL include a CI workflow that on every PR runs `pnpm install`, `pnpm -r lint`, `pnpm -r typecheck`, and `pnpm -r build`.

#### Scenario: Failing build blocks merge
- **WHEN** a PR introduces a TypeScript error
- **THEN** the CI workflow fails and the PR is blocked from merging


# project-foundation Specification

## Purpose
TBD - created by archiving change seed-inspector-demo-foundation. Update Purpose after archive.
## Requirements
### Requirement: Monorepo workspace
The repository SHALL be a pnpm workspace with `apps/dashboard`, `apps/mobile`, `packages/tokens`, `packages/types`, `packages/i18n`, and `supabase/` as discoverable workspace members.

#### Scenario: Workspace install resolves all packages
- **WHEN** a developer runs `pnpm install` from the repo root
- **THEN** all listed workspaces install without error and cross-workspace imports (e.g. `@advance-seeds/tokens`) resolve

#### Scenario: Single command builds everything
- **WHEN** a developer runs `pnpm -r build`
- **THEN** every workspace with a `build` script executes successfully and emits artifacts to its own `dist/`

### Requirement: Token pipeline single source of truth
The system SHALL derive all design tokens at build time from `docs/handoff/design-tokens.json` and emit Tailwind preset, CSS variables, and a TypeScript export.

#### Scenario: Token JSON change propagates
- **WHEN** a developer edits a color value in `docs/handoff/design-tokens.json` and runs `pnpm -F tokens build`
- **THEN** the generated Tailwind preset, CSS-vars file, and TS export all reflect the new value
- **AND** rebuilding either app produces UI using the new value

#### Scenario: No tokens defined outside the source JSON
- **WHEN** the token-lint check runs across `apps/**/*.{ts,tsx,css}`
- **THEN** any hex literal or hardcoded `px` value outside the token layer fails the check

### Requirement: TypeScript strict everywhere
All TypeScript packages SHALL extend a shared `tsconfig.base.json` with `strict: true` and shall not introduce `any` without an inline justification comment.

#### Scenario: Strict typecheck on CI
- **WHEN** CI runs `pnpm -r typecheck`
- **THEN** every workspace passes with zero `any` warnings

### Requirement: Conventional commits enforced
The repository SHALL block commits that do not follow the conventional commit format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).

#### Scenario: Bad commit message rejected
- **WHEN** a developer runs `git commit -m "stuff"`
- **THEN** commitlint fails the commit hook and the commit is not created


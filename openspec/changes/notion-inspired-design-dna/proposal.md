# Notion-Inspired Design DNA Refresh

## User-Visible Outcome

The mobile demo will keep its existing inspection journey while adopting a sharper workspace-style visual identity: navy hero bands, purple primary actions, pastel database cards, yellow readiness panels, rectangular buttons, and refreshed field-ops copy in English and Thai.

## What Changes

- Add root `DESIGN.md` as the human-readable design source for agents and engineers.
- Expand `docs/handoff/design-tokens.json` with Notion-inspired brand roles, pastel tints, elevation, and stricter 8px/12px geometry.
- Regenerate the token package artifacts and update NativeWind/global CSS variables.
- Refresh shared UI primitives and key mobile screens without changing routes, DB contracts, model contracts, or offline sync.
- Update i18n content to use concise field-workspace language.

## Non-Goals

- No Supabase schema, RLS, storage, or migration changes.
- No change to capture flow routing or detector/model registry contracts.
- No rebrand to Notion and no use of Notion trademarks, names, or logos.
- No marketing pricing page or web landing-page implementation.

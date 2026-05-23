# Design DNA Refresh Design

## Approach

Root `DESIGN.md` becomes the human-facing design contract. The JSON token file remains the build source for NativeWind/Tailwind and runtime exports. The app keeps its existing navigation model and data contracts; this change is a visual and content refresh only.

## Token Pipeline

`docs/handoff/design-tokens.json` adds:

- Purple primary action roles plus pressed/deep variants.
- Deep navy hero/camera band roles.
- Link-blue, seed-green, and brand accent colors.
- Pastel card tints for setup, variety, model, and metadata cards.
- 8px button and input radius, 12px card radius.
- Elevation tokens for cards, mockups, and modals.

`packages/tokens` maps these roles to NativeWind-friendly groups while preserving legacy `bg-brand`, `text-brand-*`, `bg-bg-*`, and semantic utilities.

## Mobile Surfaces

Shared primitives enforce the new geometry first. Screen-level refresh focuses on splash, welcome, login, Home, setup, processing, review/detail, Library, notifications, More, Models, Reports, and Settings. Camera surfaces remain minimal and use glass tokens plus domain-specific signal colors.

## Content

Existing i18n keys are reused where possible. English and Thai copy shift toward concise field-workspace language without changing route behavior or form validation.

## Data Model

No data model changes. No tables, columns, RLS policies, functions, or storage buckets are touched.

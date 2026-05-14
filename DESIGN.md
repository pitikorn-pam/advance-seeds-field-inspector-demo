---
name: Advance Seeds Field Inspector
version: 2.0.0
source: docs/handoff/design-tokens.json
---

# Advance Seeds Field Inspector Design DNA

## Overview

Advance Seeds Field Inspector presents itself as a field QA workspace: confident, compact, and inspection-ready, with a Notion-inspired editorial structure adapted for mobile operators. The product keeps the existing capture journey, but the visual system now reads as a modern workspace rather than a green agritech utility.

The first impression uses a deep navy band (`{colors.brand-navy}`) with scattered sticky-note dots, seed-grid marks, and lightweight wire illustrations. The signature primary action is purple (`{colors.primary}`), reserved for the dominant CTA and active states. Pastel database-style cards carry inspection context: yellow for model/setup readiness, mint for calibration, lavender for grade criteria, peach/rose/sky for variety and status surfaces.

This system is inspired by the Notion `DESIGN.md` model from `awesome-design-md` and `getdesign.md/notion/design-md`, but it is Advance Seeds branded. It does not copy Notion naming, logos, or product identity.

## Colors

### Brand and Primary

- **Primary Purple** (`{colors.primary}`): dominant CTA, active states, progress, and install-ready action.
- **Primary Pressed** (`{colors.primary-pressed}`): pressed state for primary actions.
- **Primary Deep** (`{colors.primary-deep}`): text on lavender chips and strong purple emphasis.
- **Brand Navy** (`{colors.brand-navy}`): hero, empty states, login/onboarding dark bands, and workspace mockup headers.
- **Brand Navy Deep** (`{colors.brand-navy-deep}`): camera/capture dark shell and deep overlays.
- **Brand Navy Mid** (`{colors.brand-navy-mid}`): panels inside dark bands.
- **Seed Green** (`{colors.brand-green}`): domain accent for calibration, seed signals, and positive field readiness.
- **Link Blue** (`{colors.link-blue}`): inline links only, not CTAs.

### Pastel Card Tints

- **Tint Yellow Bold** (`{colors.card-tint-yellow-bold}`): high-emphasis readiness cards such as model setup and capture prerequisites.
- **Tint Yellow** (`{colors.card-tint-yellow}`): warning and sample queue highlights.
- **Tint Mint** (`{colors.card-tint-mint}`): calibration and synced states.
- **Tint Lavender** (`{colors.card-tint-lavender}`): grade criteria and selected filters.
- **Tint Peach** (`{colors.card-tint-peach}`): corn/mungbean and media review moments.
- **Tint Rose** (`{colors.card-tint-rose}`): destructive confirmation and failed sync surfaces.
- **Tint Sky** (`{colors.card-tint-sky}`): model registry and metadata panels.
- **Tint Cream / Gray** (`{colors.card-tint-cream}`, `{colors.card-tint-gray}`): neutral workspace panels.

### Surface and Text

- **Canvas** (`{colors.canvas}`): primary cards and sheets.
- **Surface** (`{colors.surface}`): app background and grouped controls.
- **Surface Soft** (`{colors.surface-soft}`): quiet separators and neutral cells.
- **Hairline** (`{colors.hairline}`): 1px card borders.
- **Hairline Strong** (`{colors.hairline-strong}`): inputs and focused rows.
- **Ink / Charcoal / Slate / Stone**: primary-to-muted text ramp.
- **On Dark / On Dark Muted**: text over navy and camera glass.

## Typography

Use **Notion Sans**, falling back to Inter, Apple/system UI, Segoe UI, Helvetica, and sans-serif. Display sizes are tight and editorial; body text stays readable for field operators.

| Token                    | Size | Weight | Line Height | Use                         |
| ------------------------ | ---- | ------ | ----------- | --------------------------- |
| `{typography.display}`   | 34px | 600    | 1.08        | Splash/welcome hero         |
| `{typography.heading-1}` | 24px | 600    | 1.15        | Screen titles               |
| `{typography.heading-2}` | 19px | 600    | 1.25        | Section headings            |
| `{typography.title}`     | 15px | 500    | 1.35        | Card and button labels      |
| `{typography.body}`      | 14px | 400    | 1.55        | Primary body                |
| `{typography.caption}`   | 12px | 400    | 1.40        | Metadata                    |
| `{typography.label}`     | 11px | 600    | 1.30        | Badges and uppercase labels |

## Layout and Shapes

- Base spacing remains 4px with 8px primary rhythm.
- Buttons are rectangular with `{rounded.md}` (8px), not pills.
- Cards use `{rounded.lg}` (12px).
- Larger hero panels can use `{rounded.xl}` (16px) or `{rounded.xxl}` (20px).
- Pills are reserved for statuses, role badges, and segmented filters.
- Home, setup, and review screens use dense workspace cards instead of marketing hero sections.

## Components

### Buttons

- **Primary**: purple background, white text, 44px height, 8px radius.
- **Secondary**: transparent/white surface with strong hairline border.
- **On Dark**: white button on navy bands.
- **Ghost**: transparent with subtle pressed state.
- **Danger**: rose surface with danger text.

### Cards

- **Card Base**: canvas, 12px radius, 1px hairline, workspace padding.
- **Workspace Mockup Card**: canvas on navy band with deep diffuse shadow, used by Home and onboarding.
- **Feature Yellow Bold**: model readiness, capture prerequisites, or blocking setup states.
- **Pastel Feature Cards**: variety, calibration, sync, and grade criteria content.

### Navigation

Top bars remain compact. Icon buttons use 8px rectangles by default; bottom tabs keep the existing journey and active color uses primary purple.

### Camera

Camera UI is function-first. Use glass tokens over live preview, with purple for primary capture readiness, seed green/teal for calibration and ROI, yellow for flash/attention, and red only for recording/danger. Do not add decorative dots or illustrations over the live camera feed.

## Content Voice

The app speaks like a field workspace:

- Prefer "Inspection pulse", "Sample queue", "Model readiness", "Grade criteria", and "Synced records".
- Keep sentences short and operational.
- Avoid marketing claims inside task flows.
- Maintain English and Thai parity for every key.

## Do

- Use purple as the dominant action color.
- Use navy bands for first-impression, empty, and blocked states.
- Use pastel cards generously for varieties, setup context, and metadata.
- Keep the capture journey unchanged.
- Keep database/admin surfaces dense and scannable.

## Don't

- Do not use green as the primary CTA.
- Do not turn all buttons into pills.
- Do not use link blue for primary actions.
- Do not put decorative shapes over camera preview.
- Do not introduce raw hex values outside token, camera, or generated export code.

## Responsive Behavior

Mobile is the primary target. Cards collapse to one column, buttons maintain 40-44px touch targets, and the camera surface keeps the HUD readable over moving footage. Tablet layouts may use two-column workspace cards, but the route journey stays identical.

## Implementation Contract

- Root `DESIGN.md` is the human-facing design source.
- `docs/handoff/design-tokens.json` is the machine-readable source.
- `packages/tokens` generates Tailwind/NativeWind, CSS variables, and TypeScript tokens.
- All UI copy goes through i18n resources.

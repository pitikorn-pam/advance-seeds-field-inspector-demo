# Design system — component specification

Detailed spec for every reusable component in the Advance Seeds Field Inspector. Pair with `design-tokens.json` for raw values.

---

## Layout primitives

### Screen frame

Every screen follows this structure:

```
┌─────────────────────────────────┐
│        Status bar (44pt)        │   ← system-handled
├─────────────────────────────────┤
│        Top bar (52pt)           │   ← back / title / action
├─────────────────────────────────┤
│                                 │
│         Body (scrollable)       │   ← 20pt horizontal gutter
│                                 │
├─────────────────────────────────┤
│      Bottom action (optional)   │   ← 12-20pt vertical padding
├─────────────────────────────────┤
│        Tab bar (80pt)           │   ← only on root tabs
└─────────────────────────────────┘
```

- Horizontal screen gutter: `20pt` always
- Top bar height: `52pt` (centered title, 36pt icon buttons on either side)
- Tab bar height: `80pt` including iOS safe area / Android nav bar

### Spacing rhythm

Vertical spacing between major sections in body content:

- Within a card: `12-14pt`
- Between cards: `10-14pt`
- Between sections (with section title): `22pt` above the title
- Page hero → first content: `18-22pt`

---

## Buttons

### Primary (`btn-fill`)

```
Height:   48pt
Radius:   14pt
Padding:  0 20pt
Font:     15 / 500
Bg:       --brand
Color:    white
```

States:
- **Default** — solid brand fill
- **Pressed** — `transform: scale(0.98)` over 120ms
- **Disabled** — opacity 0.4, no press response
- **Loading** — show centered spinner, hide label

Use for: primary screen actions ("Save and sync", "Continue", "Sign in", "Use for inspection"). One per screen, ideally.

### Outline (`btn-outline`)

```
Bg:       transparent
Border:   0.5px --border-secondary
Color:    --text-primary
```

Use for: secondary actions next to a primary ("Save draft" + "Save and sync"). Cancel actions in pairs.

### Tinted (`btn-tinted`)

```
Bg:       --bg-secondary
Color:    --text-primary
```

Use for: tertiary actions, "Reanalyze", "Cancel download". Sits inline without competing visually.

### Danger text (`btn-danger-text`)

```
Bg:       transparent
Border:   0.5px --border-secondary
Color:    --text-danger
```

Use for: destructive actions ("Reject", "Delete inspection"). Always pair with a non-destructive primary.

---

## Pills / status badges

Compact 24pt-height status indicator. Always uppercase first letter, never all caps.

```
Height:    24pt
Radius:    12pt (full)
Padding:   0 11pt
Font:      12 / 500
Optional:  5pt leading dot, same color as text
```

| Variant | Bg | Text | Use case |
|---|---|---|---|
| Success | `--success-bg` | `--success-text` | Synced, Passed, Up to date |
| Warning | `--warning-bg` | `--warning-text` | Pending, Needs review |
| Danger | `--danger-bg` | `--danger-text` | Failed, Rejected |
| Info | `--info-bg` | `--info-text` | Reviewed, In progress |
| Brand | `--brand-soft` | `--brand-deep` | Lab grade, Recommended |
| Neutral | `--bg-secondary` | `--text-secondary` | Fast, Slower, No calibration |

---

## Cards

Two distinct card types — don't mix:

### Raised card

```
Bg:        --bg-primary
Border:    0.5px --border-tertiary
Radius:    18pt
Padding:   16pt vertical, 18pt horizontal
```

Use for: bounded data objects (inspection rows, settings groups, info panels). Sits on top of the secondary surface.

### Tinted card (brand-soft)

```
Bg:        --brand-soft
Border:    none
Radius:    14-18pt
Padding:   14pt
```

Use for: brand-relevant callouts ("Within Y28 specification", "v1.3 available"). Use sparingly — max one per screen.

### Hero card (deep brand)

```
Bg:        --brand-deep
Color:     white
Radius:    22pt
Padding:   22pt
```

Use for: the home dashboard hero only. Contains a label, big number, supporting text, and optional sparkline.

---

## Stat tiles

```
Bg:        --bg-secondary
Border:    none
Radius:    14pt
Padding:   14pt vertical, 12pt horizontal
Layout:    centered text
Value:     22pt / 500 / -0.02em letter-spacing
Label:     11pt / 400 / muted
```

Always grouped in 2, 3, or 4. Never standalone. Always `gap: 10pt` between tiles in a horizontal grid.

```
[ 47    ]  [ 11.4  ]  [ 83%   ]
[ Total ]  [ Avg mm]  [ A     ]
```

---

## Inputs

### Text input

```
Height:    48pt
Border:    0.5px --border-secondary
Radius:    12pt
Bg:        --bg-primary
Padding:   0 14pt
Font:      15 / 400
```

States:
- **Default** — hairline border
- **Focus** — border becomes `--brand`, plus 2pt `--brand-soft` glow ring
- **Error** — border becomes `--text-danger`, plus error message below in `--text-danger`
- **Disabled** — opacity 0.5, not focusable

### Select / dropdown

Same as text input but with chevron-down on the right and click-through behavior.

### Textarea

Same styling, but `min-height: 96pt`, `padding: 14pt`, no fixed height.

### Field label

```
Font:      12 / 500
Color:     --text-secondary
Margin:    0 0 8pt 4pt (just above the field, slightly indented)
```

Optional suffix: "— optional" in `--text-tertiary` regular weight.

---

## Toggle

```
Width:     50pt
Height:    30pt
Radius:    full (15pt)
Knob:      24pt diameter, white, 3pt inset
```

States:
- **Off** — track `--border-secondary`, knob aligned left
- **On** — track `--brand`, knob translates 20pt right
- **Transition** — 180ms ease

Always paired with a label on its left. Don't use toggles for things that need explanation — use radio rows or a settings detail screen instead.

---

## Segmented control

```
Track:     --bg-secondary, padding 3pt, radius 12pt
Option:    8pt vertical / 6pt horizontal padding
Active:    --bg-primary, radius 9pt, optional hairline shadow
```

Max 4 options. For 5+, use a dropdown or a list. Don't use segmented controls for >2 levels of hierarchy.

---

## List rows

The single most-repeated component in the app. Used in every list (recent inspections, history, varieties, menu groups).

```
Layout:    [ thumb ] [ title + meta ] [ trailing ] [ chevron? ]
Padding:   14pt vertical, 4pt horizontal (inside a card with 14pt padding)
Gap:       14pt between thumb / content / trailing
Border:    0.5px --border-tertiary bottom (omit on last row)
```

| Element | Spec |
|---|---|
| Thumb | 44×44pt, radius 12, secondary bg, optional initial/number/icon |
| Title | 14 / 500 / `--text-primary` |
| Meta | 12 / 400 / `--text-secondary` |
| Trailing | Pill, value, or chevron |
| Chevron | 16pt, `--text-tertiary` |

### Variations

- **Inspection row** — thumb shows seed count, trailing shows sync status pill
- **Variety row** — thumb is colored circle with letter, meta shows reference dimensions
- **Menu row** — leading icon in 32pt rounded square, no thumb
- **Stats row** — left-aligned label, right-aligned value, no thumb, no chevron

---

## Tab bar (mobile)

```
Height:    80pt (includes safe area)
Bg:        --bg-primary
Border:    0.5px --border-tertiary top
```

Per tab:
```
Icon:      22×22 outline, currentColor, 1.6 stroke
Label:     10pt / 500
Active:    --brand color
Inactive:  --text-tertiary color
Layout:    icon stacked above label, 3pt gap
```

Maximum 4 tabs. Order matters — most-used first. For Advance Seeds: Home / History / Library / Profile.

---

## Top bar

```
Height:    52pt
Padding:   16pt horizontal
Layout:    [back] [title or empty] [action] (justified)
```

| Element | Spec |
|---|---|
| Back / icon button | 36pt circle, `--bg-secondary`, ghost variant for transparent |
| Title | 17pt / 500, centered (left-aligned for landing screens) |
| Action | 36pt icon button or text button |

---

## Camera UI

The most distinctive surface. Translucent dark glass over the live feed.

### Glass chip

```
Bg:        rgba(0, 0, 0, 0.55)
Color:     white
Radius:    18pt (full pill)
Padding:   8pt vertical, 14pt horizontal
Font:      12 / 500
Optional:  6pt dot on the leading edge
```

Use for status pills, mode indicators, control buttons over camera feed.

### Camera stats panel

```
Position:  bottom 14pt, both sides 14pt
Bg:        rgba(0, 0, 0, 0.62)
Color:     white
Radius:    18pt
Padding:   14pt vertical, 18pt horizontal
Layout:    3-column grid, gap 14pt
```

Per stat: 20pt / 500 value, 10pt / 0.02em letter-spaced label, opacity 0.65.

### Shutter button

```
Diameter:    70pt
Border:      4pt, color depends on mode
Inner:       fills, 92% scale
```

| Mode | Border | Inner |
|---|---|---|
| Live | `#DC2828` | `#DC2828` |
| Precise | `--text-primary` | `--text-primary` |

---

## Detection overlay (rings)

The seed detection rings drawn over the camera feed.

```
Border:      1.5pt
Radius:      50% (always elliptical, matching the seed)
```

| Grade | Color | Notes |
|---|---|---|
| A (passed) | `#5DCAA5` | Add 1pt soft outer glow at 25% opacity for emphasis |
| B (warning) | `#EF9F27` | No glow |
| Reject | `#E24B4A` | No glow |

Each ring sits ~6pt larger than the bounding ellipse of the detected seed.

---

## Grade pills

Used on per-seed result rows.

```
Diameter:    24pt (or 26 in detail headers)
Radius:      full
Font:        11 / 500
```

| Grade | Bg | Color |
|---|---|---|
| A | `--success-bg` | `--success-text` |
| B | `--warning-bg` | `--warning-text` |
| Reject | `--danger-bg` | `--danger-text` |

---

## Bottom sheets

```
Bg:        --bg-primary
Radius:    22pt 22pt 0 0 (top corners only)
Padding:   14pt top (handle), 18pt content, 24pt bottom
Handle:    36×4pt, --border-secondary, radius 2pt, centered
Backdrop:  rgba(0, 0, 0, 0.4)
```

Animate in: 250ms ease-out, slide up from bottom + backdrop fade in.
Animate out: 200ms ease-in, mirror.

Tap backdrop or drag handle down to dismiss. Don't use bottom sheets for anything destructive — use a confirmation alert instead.

---

## Dark mode rules

The app is dark-mode-mandatory. Three rules:

1. **Never hardcode hex** in code. Always use a token from `design-tokens.json`.
2. **Brand color shifts**: `#0F6E56` (light) → `#5DCAA5` (dark). Brand-soft and brand-deep also shift to maintain contrast.
3. **Test the camera screens** in dark mode — the dark glass chips can disappear if not careful with backdrop opacity.

---

## Accessibility

Required minimums:

- All text colors hit 4.5:1 contrast on their stated background (verified for the palette here)
- Tap targets minimum 44×44pt — applies to icon buttons (36pt visual + 4pt padding each side)
- Dynamic Type support (iOS) / scalable sp (Android)
- Camera viewfinder has accessibility label that announces current detection state ("47 seeds detected, 83% Grade A")
- All interactive elements have accessible names

---

## What NOT to do

A few things that look right but break the system:

- ❌ Don't use brand color for body text
- ❌ Don't use semantic colors (success/warning/danger) for non-status UI
- ❌ Don't add weight 600 or 700 — use size + spacing for hierarchy instead
- ❌ Don't use shadows or gradients (with the only allowed exception being the brand glow on input focus)
- ❌ Don't add a fifth tab to the tab bar — refactor into a sub-navigation instead
- ❌ Don't hide sync status — it must always be visible on home
- ❌ Don't auto-switch capture modes — let the user choose every time

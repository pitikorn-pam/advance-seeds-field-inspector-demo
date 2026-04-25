# Advance Seeds Field Inspector — Developer handoff

**Version 1.0.0** · Mobile native (iOS + Android) · Web dashboard companion

This package contains the design system and component spec for building the Advance Seeds Field Inspector. The mobile app is a native iOS + Android implementation, with a separate web dashboard for the R&D team.

---

## What's in this package

| File | Purpose | Owner |
|---|---|---|
| `design-tokens.json` | Canonical machine-readable tokens (the source of truth) | Design + dev |
| `design-tokens.css` | CSS variables for web dashboard + Flutter web | Web team |
| `DesignTokens.swift` | SwiftUI tokens, modifiers, and asset catalog spec | iOS team |
| `Theme.kt` | Compose theme with `AdvanceSeedsTheme {}` envelope | Android team |
| `DESIGN_SYSTEM.md` | Detailed component spec with measurements + states | All teams |
| `prototype.html` | Standalone interactive prototype — open in any browser | All teams |
| `HANDOFF.md` | This file | All teams |

---

## Quickstart by platform

### iOS (SwiftUI)

1. Drop `DesignTokens.swift` into your project.
2. Create the Color Sets in `Assets.xcassets` listed at the bottom of that file (one per `DS{Name}` color).
3. Use tokens directly:

```swift
Text("Hello, Jane")
    .font(DS.Type.display)
    .foregroundColor(DS.Colors.textPrimary)

Button("Save and sync") { save() }
    .dsPrimaryButton()

VStack(spacing: DS.Space.md) {
    StatTile(value: "47", label: "Total")
}
.dsCard()
```

### Android (Jetpack Compose)

1. Drop `Theme.kt` into `com.advanceseeds.theme`.
2. Wrap your app:

```kotlin
setContent {
    AdvanceSeedsTheme {
        Surface(color = LocalDS.current.bgPrimary) {
            HomeScreen()
        }
    }
}
```

3. Use tokens directly:

```kotlin
val ds = LocalDS.current

Text("Hello, Jane", style = DSType.Display, color = ds.textPrimary)

Button(
    onClick = { save() },
    colors = ButtonDefaults.buttonColors(containerColor = ds.brand),
    shape = RoundedCornerShape(DSComponent.Button.Radius),
    modifier = Modifier.fillMaxWidth().height(DSComponent.Button.Height)
) {
    Text("Save and sync", color = ds.brandOn)
}
```

### Web dashboard

1. Import `design-tokens.css` once at app root.
2. All variables are namespaced `--as-*` to avoid collisions.

```html
<link rel="stylesheet" href="design-tokens.css">

<style>
  .my-button {
    background: var(--as-brand);
    color: var(--as-brand-on);
    border-radius: var(--as-radius-lg);
    height: 48px;
    font: 500 15px/1 var(--as-font-sans);
  }
</style>
```

---

## Brand identity

Single accent: deep teal `#0F6E56` light mode, lifted to `#5DCAA5` for dark mode. Use for primary actions, active tab states, the seed-detection mask color, and brand-tinted surfaces. Avoid using brand color for purely decorative elements — it should signal something is interactive or active.

Status colors (success/warning/danger/info) are the standard semantic palette and follow Apple HIG / Material conventions. Don't repurpose them for non-status meaning.

---

## Type system

Two weights only — `400 regular` and `500 medium`. Never `600` or `700`. The contrast comes from size jumps, not extra weight.

| Style | Size | Weight | Use case |
|---|---|---|---|
| `Display` | 30 | 500 | Page heroes ("Hello, Jane", "Detect, measure, grade") |
| `H1` | 22 | 500 | Screen titles in top bars |
| `H2` | 18 | 500 | Section headers |
| `Title` | 15 | 500 | Card titles, list row primary text |
| `Body` | 14 | 400 | Descriptions, paragraph copy |
| `Caption` | 12 | 400 | Metadata, timestamps |
| `Label` | 11 | 500 | Tile labels, form labels (with letter-spacing) |
| `Mono` | 12 | 400 | Batch IDs, technical values |

Sentence case throughout — never Title Case, never ALL CAPS (except letter-spaced labels).

---

## Spacing — multiples of 4

`xs:4 · sm:8 · md:12 · lg:16 · xl:20 · 2xl:24 · 3xl:32 · 4xl:40`

Common patterns:
- Card padding: `16 × 18`
- Screen edge gutter: `20`
- List row gaps: `12 / 14`
- Section spacing (vertical): `22 / 32`

---

## Component contract

The full spec lives in `DESIGN_SYSTEM.md`. Key dimensions:

| Component | Height | Radius | Notes |
|---|---|---|---|
| Primary button | 48 | 14 | Full width inside cards/modals |
| Input field | 48 | 12 | 0.5px border, brand glow on focus |
| Pill / status badge | 24 | 12 | Optional 5px leading dot |
| Card | — | 18 | 0.5px border, secondary surface only at root |
| Stat tile | — | 14 | No border, secondary background |
| Tab bar | 80 | 0 | Includes safe-area inset |
| Icon button | 36 | 36 (full) | Tap target |
| Toggle | 30 | 30 (full) | Brand fill when on |

---

## States to implement (per screen)

For every primary screen, implement these four states explicitly:

1. **Loaded** — happy path with realistic data
2. **Empty** — no data yet (first run, no varieties, no history)
3. **Loading** — skeleton or spinner, depending on duration
4. **Error** — sync failed, model not loaded, no permission

The prototype shows specific examples of each. Don't ship a screen until all four work.

---

## Critical UX patterns

A few patterns are load-bearing in this app — please don't deviate without checking:

**Sync status is always visible.** The home screen always shows a sync pill (green "All synced" / amber "N pending" / red "Offline"). Never hide it. Users must trust their work won't be lost.

**Capture is a one-tap affordance.** From home, "+ New inspection" is the single biggest button. From there, the user is at most 3 taps from a captured frame: setup → mode → shutter.

**Per-seed inspection is always reachable.** From any review or detail screen, tapping a seed thumbnail must take the user to the seed detail view. This is what makes the app feel "real" instead of "approximate."

**Calibration is honest.** Show the user the actual `px/mm` value. Show whether LiDAR or ArUco is being used. If calibration fails, say so — don't fall back silently.

---

## Asset requirements

The mobile apps need:

- **App icon** — brand mark on `#0F6E56` background, rounded square, all standard sizes
- **Launch screen** — brand mark centered on `#FFFFFF` (light) / `#0F0F11` (dark)
- **Onboarding hero** — three illustrations (camera, target, sync) — TBD, placeholder shown in prototype
- **Variety photos** — hand off via the dashboard, downloaded by the app on demand. Specs: 1024×1024 JPG, top-lit, white background

---

## Open questions for the dev team

These need answers before week 1:

1. **iOS minimum**: 15.0 (covers 95% of devices, full SwiftUI)? Or 16.0 for newer LiDAR APIs?
2. **Android minimum**: API 26 (8.0)? Or higher to ensure NNAPI is reliable?
3. **Auth provider**: Custom email/password backed by your service, or Auth0 / Firebase Auth?
4. **Offline storage budget**: How many recent inspections + images cached locally before LRU eviction?
5. **Image upload format**: Original camera resolution, or downscaled to ~1080p server-side max?

---

## Workflow ownership

| Phase | Output | Owner |
|---|---|---|
| Tokens + components | This package | Design lead |
| Hi-fi designs in Figma | Frame-per-screen Figma file | Designer |
| Native iOS scaffold | Builds with mock data | iOS dev |
| Native Android scaffold | Builds with mock data | Android dev |
| Backend API | OpenAPI spec + mock server | Backend dev |
| Real model integration | Drops in via `SeedAnalyzer` interface | ML dev |
| Web dashboard | Reads API, displays analytics | Web dev |

---

## Support

Questions on this package? Tag the design lead in the project channel or open an issue against this repo.

The prototype HTML is the canonical reference for screen behavior — when in doubt, that's the answer. Tokens here may evolve; always pull the latest `design-tokens.json` rather than copying values into code.

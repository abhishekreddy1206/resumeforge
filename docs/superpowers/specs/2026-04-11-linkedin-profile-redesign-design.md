# LinkedIn-Style Profile Page Redesign

**Date:** 2026-04-11

## Problem

The profile page currently uses a functional but visually flat layout — a basic two-column grid with Card components stacked vertically. It doesn't feel polished or "premium." The user wants it to look and feel more like LinkedIn's profile page while keeping all existing editing functionality intact.

## Design Decisions

- **Layout:** LinkedIn-style card-per-section with banner header, keeping the 2-column layout (main + 360px sidebar)
- **Color theme:** Perplexity-inspired — understated turquoise/teal accent on warm off-white backgrounds. Replaces the current vermillion/cream palette **app-wide** (globals.css CSS variable swap)
- **Scope:** Visual layout only — no changes to editing UX, CRUD forms, or data flow
- **Dark mode:** Teal-tinted deep backgrounds with turquoise accents (Perplexity's warm-dark approach)

## Color System (Perplexity-Inspired)

All values in OKLch, replacing the existing CSS variables in `globals.css`.

Reference hex values from Perplexity's palette:
- Primary teal: `#20808D` → `oklch(0.560 0.080 192)`
- Turquoise bright: `#1FB8CD` → `oklch(0.700 0.105 200)`
- Light tint: `#DEF7F9` → `oklch(0.960 0.025 200)`
- Warm off-white bg: `#F3F3EE` → `oklch(0.955 0.005 100)`
- Warm white surface: `#FBFAF4` → `oklch(0.980 0.006 95)`
- Text charcoal: `#091717` → `oklch(0.160 0.015 192)`
- Dark card: `#13343B` → `oklch(0.250 0.025 200)`
- Dark bg: `#121516` → `oklch(0.140 0.005 200)`
- Dark accent: `#114F56` → `oklch(0.360 0.045 195)`

### Light Mode

| Token | Current (Vermillion) | New (Perplexity Teal) |
|---|---|---|
| `--background` | `oklch(0.970 0.008 72)` | `oklch(0.955 0.005 100)` |
| `--foreground` | `oklch(0.145 0.010 55)` | `oklch(0.160 0.015 192)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.995 0.002 100)` |
| `--card-foreground` | `oklch(0.145 0.010 55)` | `oklch(0.160 0.015 192)` |
| `--popover` | `oklch(1 0 0)` | `oklch(0.995 0.002 100)` |
| `--popover-foreground` | `oklch(0.145 0.010 55)` | `oklch(0.160 0.015 192)` |
| `--primary` | `oklch(0.520 0.170 30)` | `oklch(0.560 0.080 192)` |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` |
| `--secondary` | `oklch(0.950 0.010 65)` | `oklch(0.950 0.008 100)` |
| `--secondary-foreground` | `oklch(0.250 0.010 60)` | `oklch(0.260 0.015 192)` |
| `--muted` | `oklch(0.940 0.008 70)` | `oklch(0.940 0.005 100)` |
| `--muted-foreground` | `oklch(0.500 0.015 65)` | `oklch(0.500 0.015 192)` |
| `--accent` | `oklch(0.975 0.015 30)` | `oklch(0.960 0.025 200)` |
| `--accent-foreground` | `oklch(0.520 0.170 30)` | `oklch(0.560 0.080 192)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.577 0.245 27.325)` |
| `--border` | `oklch(0.875 0.012 72)` | `oklch(0.900 0.006 100)` |
| `--input` | `oklch(0.875 0.012 72)` | `oklch(0.900 0.006 100)` |
| `--ring` | `oklch(0.520 0.170 30)` | `oklch(0.560 0.080 192)` |

**Chart colors:**
- `--chart-1`: `oklch(0.560 0.080 192)` — primary teal
- `--chart-2`: `oklch(0.700 0.105 200)` — bright turquoise
- `--chart-3`: `oklch(0.550 0.150 160)` — keep (green-teal, harmonizes)
- `--chart-4`: `oklch(0.600 0.100 280)` — soft indigo accent
- `--chart-5`: `oklch(0.650 0.080 55)` — warm gold accent

**Sidebar colors:** Mirror the main tokens.

### Dark Mode

| Token | Current (Brass/Amber) | New (Perplexity Dark) |
|---|---|---|
| `--background` | `oklch(0.122 0.008 50)` | `oklch(0.140 0.005 200)` |
| `--foreground` | `oklch(0.952 0.006 72)` | `oklch(0.960 0.005 200)` |
| `--card` | `oklch(0.162 0.009 52)` | `oklch(0.250 0.025 200)` |
| `--card-foreground` | `oklch(0.952 0.006 72)` | `oklch(0.960 0.005 200)` |
| `--popover` | `oklch(0.162 0.009 52)` | `oklch(0.250 0.025 200)` |
| `--popover-foreground` | `oklch(0.952 0.006 72)` | `oklch(0.960 0.005 200)` |
| `--primary` | `oklch(0.670 0.148 44)` | `oklch(0.700 0.105 200)` |
| `--primary-foreground` | `oklch(0.095 0.005 50)` | `oklch(0.100 0.010 200)` |
| `--secondary` | `oklch(0.212 0.010 54)` | `oklch(0.280 0.020 200)` |
| `--secondary-foreground` | `oklch(0.952 0.006 72)` | `oklch(0.960 0.005 200)` |
| `--muted` | `oklch(0.222 0.008 55)` | `oklch(0.300 0.018 200)` |
| `--muted-foreground` | `oklch(0.608 0.018 62)` | `oklch(0.620 0.030 200)` |
| `--accent` | `oklch(0.232 0.014 50)` | `oklch(0.360 0.045 195)` |
| `--accent-foreground` | `oklch(0.670 0.148 44)` | `oklch(0.700 0.105 200)` |
| `--destructive` | `oklch(0.650 0.200 22)` | `oklch(0.650 0.200 22)` |
| `--border` | `oklch(0.262 0.014 54)` | `oklch(0.320 0.020 200)` |
| `--input` | `oklch(0.262 0.014 54)` | `oklch(0.320 0.020 200)` |
| `--ring` | `oklch(0.670 0.148 44)` | `oklch(0.700 0.105 200)` |

**Dark chart colors:**
- `--chart-1`: `oklch(0.700 0.105 200)`
- `--chart-2`: `oklch(0.750 0.090 200)`
- `--chart-3`: `oklch(0.600 0.150 160)` (keep)
- `--chart-4`: `oklch(0.700 0.100 280)`
- `--chart-5`: `oklch(0.750 0.080 55)`

### Gradient Text

- Light: `oklch(0.560 0.080 192)` → `oklch(0.650 0.090 200)` (teal to turquoise)
- Dark: `oklch(0.700 0.105 200)` → `oklch(0.780 0.080 200)` (turquoise to light turquoise)

### Other Hardcoded Colors

- `.card-hover` box-shadow: update oklch hue to 192
- `.glass` dark: update to `oklch(0.250 0.025 200 / 0.85)`
- `.skeleton-shimmer`: update hue to 100 (light) and 200 (dark)
- `.paper-bg` dark vignette: update hue to 200
- Enhanced buttons: all warm hues (27, 30, 42, 44, 45) shift to 192-200

## Profile Page Layout Changes

### Banner Header (replaces current Header Card)

Current: Small `h-16` gradient strip → CardHeader with name/contact/social icons as squares

New LinkedIn-style banner:
```
┌──────────────────────────────────────────────────────┐
│  ████████████████████████████████████████████████████ │  ← h-32 teal gradient
│  ┌──────┐                                            │
│  │  JD  │  ← 72px circular avatar, -mt-9 overlap    │
│  └──────┘                                            │
│  Jane Doe                          [Upload Resume]   │
│  Senior Software Engineer · Full Stack               │
│  📍 SF · 📧 jane@... · 📱 (555)...                  │
│  [github.com/janedoe] [linkedin.com/in/janedoe]      │  ← social pill badges
└──────────────────────────────────────────────────────┘
```

Implementation:
- Banner: `bg-gradient-to-br from-primary/80 via-primary/50 to-primary/20`
- Avatar: 72px circle, `bg-accent`, `border-4 border-card`, `-mt-9`
- Name: serif font (`font-display`)
- Social links: `rounded-full` pill badges with icon + URL text

### Section Cards

About, Experience, Projects, Education, Publications, Certifications, Recommendations — each as standalone white Card.

**New elements per section:**
1. **About** — Extracted from header card into its own card
2. **Experience** — Company initial square (40px, bg-accent, text-primary) + skill badges per entry
3. **Education** — School initial square (same pattern)
4. **Publications** — Left accent border (`border-l-2 border-primary/40`)
5. **Recommendations** — Blockquote style: `bg-muted/30`, `border-l-[3px] border-primary`, recommender initials avatar

### Sidebar

No structural changes. Color theme naturally updates through CSS variables.

## Files to Modify

1. **`src/app/globals.css`** — Swap all OKLch color values, update hardcoded colors
2. **`src/app/profile/page.tsx`** — Banner header, About extraction, initial squares, recommendation blockquotes

## Verification

1. `npm run dev` → check profile page in light + dark mode
2. Check other pages for consistent teal theme
3. Test all CRUD operations
4. Test mobile responsiveness
5. `npm run build` — no errors

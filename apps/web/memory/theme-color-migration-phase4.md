# Phase 4 - Color Sweep and Migration Rules

## Audit Commands

```bash
# 1) Hardcoded Tailwind color utilities in components/pages
rg -n "\\b(bg|text|border|ring|from|to|via|stroke|fill)-(slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|white|black)-" frontend/src --glob "*.tsx"

# 2) Inline color literals in TS/TSX
rg -n "#[0-9a-fA-F]{3,8}\\b|rgba?\\(|oklch\\(" frontend/src --glob "*.ts" --glob "*.tsx"
```

## Safe Mass-Replacement Rules

These were applied in this phase and are safe to repeat for new code:

- `bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white` -> `brand-gradient`
- `bg-gradient-to-r from-amber-500 to-rose-500 text-white` -> `brand-gradient`
- Hero/page gradients (`from-amber|cyan|violet|blue...`) -> `brand-gradient`
- Fuchsia utility colors -> primary tokens
  - `text-fuchsia-*` -> `text-primary`
  - `bg-fuchsia-*` -> `bg-primary/10`
  - `hover:bg-fuchsia-*` -> `hover:bg-primary/10`
- Rose error states -> destructive tokens
  - `text-rose-*` -> `text-destructive`
  - `bg-rose-*` -> `bg-destructive/10`
  - `border-rose-*` -> `border-destructive/35`
- Emerald success states -> success tokens
  - `text-emerald-*` -> `text-success`
  - `bg-emerald-*` -> `bg-success/10` (or `bg-success/15` for icon chips)
- Yellow/amber caution states -> warning tokens
  - `text-yellow-*` / `text-amber-*` -> `text-warning`
  - `bg-yellow-*` / `bg-amber-*` -> `bg-warning/10` or `bg-warning/15`

## Manual Review Buckets (when audit fails)

- Semantic ambiguity:
  - Any color used for meaning (positive/negative/warning) where intent is unclear from context.
- Chart-only exceptions:
  - `<defs><linearGradient>` values can remain literal if token mapping is not possible.
- Token-source files:
  - `src/index.css` token values are expected to contain raw color values.

## Current Status (after Phase 4)

- TSX/TX hardcoded Tailwind named color classes: none detected.
- Inline hex/rgb/rgba color literals in TSX: none detected.
- Continuous guardrail added:

```bash
npm run theme:audit
npm run theme:audit:check
```

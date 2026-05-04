# ADR 004: Semantic Design Tokens with an OKLCH-Capable Theme Layer

- Status: Accepted
- Date: 2026-03-06

## Context

The frontend uses Tailwind CSS v4 theme variables, semantic CSS custom
properties in `frontend/src/index.css`, and lint/audit rules intended to keep
components from hardcoding palette values. The system already exposes
OKLCH-capable values through the Tailwind theme layer and chart fallbacks, while
the application-facing semantic tokens such as `--bg`, `--surface`, and
`--primary` are currently stored as HSL triplets and then mapped to Tailwind
aliases like `--color-background` and `--color-primary`.

The real architectural need is not "store every token in one color syntax". It
is to keep components bound to semantic tokens, preserve a clean light/dark
contract, and retain the option to use perceptual color spaces where they add
value.

## Decision

We define the design-system contract at the semantic-token layer, not at the
raw color-literal layer.

That means:

- components consume semantic tokens and aliases, not inline hex/HSL/OKLCH
- the theme layer remains free to use OKLCH-capable palette values where useful
- dark mode is expressed by overriding semantic tokens under `.dark`
- route themes, chart colors, and UI primitives derive from the same semantic
  token hierarchy

In practice today, semantic tokens are mostly encoded as HSL triplets for easy
composition with existing Tailwind aliases, while the surrounding theme system
remains compatible with OKLCH-based palette definitions and fallbacks. The
important constraint is semantic indirection, not one mandatory storage syntax.

## Consequences

Positive:

- light and dark themes can swap palette intent without rewriting components
- lint rules can ban hardcoded palette usage consistently
- shared primitives, charts, and page themes stay visually coordinated
- the project can migrate more tokens toward OKLCH later without changing the
  component API

Tradeoffs:

- the codebase currently mixes semantic HSL tokens with some OKLCH-capable theme
  values, so contributors must understand the distinction
- token changes require discipline because visual regressions propagate broadly
- design docs must describe the hierarchy clearly to avoid "raw color" drift

The dark-mode contract is therefore: override semantic tokens at the root, keep
components semantic, and treat raw palette literals as implementation details.

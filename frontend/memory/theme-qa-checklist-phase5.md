# Phase 5 - Theme QA and Regression Safety

## 1) Manual QA Checklist (Color Consistency)

Run in both `light` and `dark` mode.

### A. App Shell

- Open `/` `/activity` `/plan` `/insights` `/profile`.
- Verify topbar, sidebar/nav, bottom tabs, and FAB all use token-driven theme colors.
- Verify active nav item color is consistent across desktop and mobile.
- Verify hover states use muted/token colors (no page-specific fuchsia/amber/blue classes).

### B. Page Surfaces

- Verify all major sections use consistent `section-panel` / `inner-card` surfaces.
- Verify borders and elevated surfaces match tokenized `border` and `shadow` tone.
- Verify empty states use themed icon chips and semantic text colors.

### C. Interactive Components

- Buttons: check `default`, `outline`, `destructive`, and gradient CTAs.
- Inputs/selects/dialogs: check border, focus ring, placeholder contrast.
- Check command palette backdrop and drawer backdrop in both modes.

### D. Feedback + Status

- Trigger success/error/warning/info toasts and verify semantic token colors.
- Check warning/duplicate banners in transaction dialogs.
- Check destructive actions (delete buttons, error notices) use destructive tokens.

### E. Charts

- Verify chart strokes/fills/tooltips/axes are token-based and readable in both modes.
- Confirm no hardcoded hex in TSX chart props (except allowed gradient defs when necessary).

### F. Accessibility Focus

- Keyboard-tab through nav, filters, form inputs, dialog actions.
- Verify visible `ring` and offset in both themes.

## 2) Playwright Visual Regression

### Run

```bash
cd frontend
npm run test:e2e:visual
```

### First-time or intentional theme update

```bash
cd frontend
npm run test:e2e:visual -- --update-snapshots
```

### What is covered now

- Dev UI gallery screenshots in light + dark.
- App shell route matrix in light + dark:
  - dashboard, activity, budget, insights, profile.
- Dark profile audit screenshot (white-box regression guard).
- Dark add-transaction dialog screenshot.

## 3) Guardrails

Run these checks before merge:

```bash
cd frontend
npm run theme:audit:check
npm run build
npm run test:e2e:visual
```

If screenshots changed intentionally, update snapshots in the same PR and mention why.

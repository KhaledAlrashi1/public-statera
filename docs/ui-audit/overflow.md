# UI Audit: Floating Elements and Viewport Overflow

**Date:** 2026-04-24

## Scope

Every floating/overlay UI primitive across the frontend — dropdowns, dialogs, tooltips,
command palette — audited for viewport-overflow risk on small screens (≤ 375 px wide,
≤ 667 px tall, e.g. iPhone SE).

---

## Inventory

### 1. Radix `SelectContent` — `frontend/src/components/ui/select.tsx:30`

- **Mechanism:** `SelectPrimitive.Portal` (renders outside DOM tree to `document.body`).
  Radix `position="popper"` activates built-in flip/collision detection.
- **Overflow guards:** `max-h-96 overflow-y-auto` on `SelectPrimitive.Viewport` (line 47).
  ScrollUpButton / ScrollDownButton for keyboard-accessible scrolling.
- **Collision detection:** Active by default via Radix's popper position engine.
  `avoidCollisions` not explicitly disabled anywhere.
- **Status:** **Safe.** Radix handles viewport bounds.

### 2. Radix `TooltipContent` — `frontend/src/components/ui/tooltip.tsx:9`

- **Mechanism:** `TooltipPrimitive.Portal` (renders to `document.body`).
- **Collision detection:** Radix default — flips side if insufficient space.
  `sideOffset={4}` default maintained.
- **Status:** **Safe.** No scrollable container, short text only.

### 3. Suggestion Dropdown (custom, 3 instances)

These are hand-rolled `<div className="absolute z-50 mt-2 ...">` elements rendered inside
a scroll-clipped `DialogContent` (`overflow-y-auto`). They are **not** portalled to `document.body`.

| Instance | File | Line |
|---|---|---|
| AddTransactionDialog (QuickAdd) | `transactions/dialogs.tsx` | 639 |
| EditTransactionDialog | `transactions/dialogs.tsx` | 1194 |
| AddExpenseDialog | `expenses/dialogs.tsx` | 163 |

**Overflow risks:**
- The surrounding `DialogContent` has `overflow-y-auto`, which creates a **scroll container**.
  An `absolute` child inside a scroll container is clipped to that container's bounds.
  On small screens where the dialog is near full-height, the dropdown may extend beyond the
  dialog's scrollable area and be partially or fully hidden.
- No `max-h` or `overflow-y` on the dropdown div itself — on keyboards-up mobile where
  the dialog occupies almost the whole viewport, all 12 suggestion rows can push below the fold.
- No collision detection — the dropdown always opens below the input regardless of available space.

**Status:** **Needs fix.** See PR 4.

### 4. AppShell User Menu — `frontend/src/components/layout/AppShell.tsx:281`

```tsx
<div className="absolute right-0 top-11 z-50 min-w-[180px] ...">
```

- **Mechanism:** Positioned relative to the header button's nearest positioned ancestor.
  The header is `sticky top-0`, so the dropdown renders below the button in the fixed nav.
- **Overflow risks:**
  - The menu is always right-aligned (`right-0`), so it won't bleed off the right edge.
  - On very narrow screens (< 200 px, pathological) the `min-w-[180px]` could overhang the
    left edge, but this is not a realistic viewport size.
  - No bottom-boundary check: on screens ≤ 240 px tall the menu items could extend below the
    viewport bottom. Unrealistic in practice (the nav itself wouldn't be usable).
- **Status:** **Acceptable.** No realistic overflow scenario; menu content is fixed and short.

### 5. Command Palette — `frontend/src/components/layout/CommandPalette.tsx`

```tsx
<div className="fixed inset-x-4 top-[15vh] z-[60] mx-auto max-w-lg">
  <div className="surface-overlay overflow-hidden">
    <div className="max-h-[320px] overflow-y-auto p-2">
```

- **Mechanism:** `fixed` positioning, `inset-x-4` keeps 4 px margin from both edges.
  `max-h-[320px]` + `overflow-y-auto` on the results list.
- **Overflow risks:**
  - `top-[15vh]` + `max-h-[320px]` = 150 px + 320 px = 470 px minimum height needed.
    On a 375 × 667 iPhone SE in portrait this is fine (197 px spare). In landscape on
    the same device (667 × 375) the available height is 375 px; 15 % of 375 = 56 px,
    leaving 319 px for the palette — exactly at the limit. In practice the results list
    shortens dynamically.
  - No bottom boundary cap — if the content somehow exceeded `max-h-[320px]` (it can't,
    because it's capped) the overflow would scroll, not clip.
- **Status:** **Acceptable.** `max-h` cap prevents real overflow.

### 6. `DialogContent` — `frontend/src/components/ui/dialog.tsx`

All `DialogContent` usage in the app sets `max-h-[92vh] overflow-y-auto`, e.g.:

```tsx
<DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl ... overflow-y-auto">
```

- **Mechanism:** Radix `DialogContent` renders in a `Portal` to `document.body`. The
  `fixed` overlay and centred positioning come from Radix defaults.
- **Overflow risks:** None at the dialog level — `max-h-[92vh]` + `overflow-y-auto` are
  standard. The risk is what renders *inside* the dialog (see item 3 above).
- **Status:** **Safe at the dialog level.**

---

## Summary of issues requiring fixes (PR 4)

| Priority | Surface | Issue | Fix approach |
|---|---|---|---|
| High | Suggestion dropdowns (3×) | `absolute` inside `overflow-y-auto` container; no `max-h`; no collision detection | Convert to `position: fixed` or add `max-h` + `overflow-y-auto` on the dropdown div; clamp to viewport bottom |
| Low | Suggestion dropdowns (3×) | Always opens downward; no upward flip when near bottom of viewport | After adding `max-h`, check if remaining space is < dropdown height and flip to `bottom: 100%` direction |

The three suggestion dropdowns are structurally identical — the fix should be applied
uniformly, ideally via a shared CSS utility class or a small shared component.

---

## Playwright test targets (PR 4)

Viewports to test:
- 375 × 667 (iPhone SE, portrait)
- 390 × 844 (iPhone 14, portrait)
- 1280 × 800 (desktop baseline)

Scenarios:
- Open AddTransactionDialog, type in the name field to trigger suggestions, assert dropdown
  is visible and fully within the viewport (no clipping below bottom edge).
- Repeat for EditTransactionDialog and AddExpenseDialog.

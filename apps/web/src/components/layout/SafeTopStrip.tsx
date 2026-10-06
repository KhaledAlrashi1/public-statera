// MOB-R78 E3 — one fixed strip of the page background over the status bar (clock, battery), the height of
// the top safe area. Content that scrolls up passes under it instead of under the status bar. It sits above
// everything at the top and takes no taps. Zero high in a browser, where there is no inset.
export function SafeTopStrip() {
  return (
    <div
      aria-hidden="true"
      data-testid="safe-top-strip"
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[var(--safe-top)] bg-background"
    />
  )
}

import { useSyncExternalStore } from "react"

// MOB-R91 C3 — payday months on the client, the same rule (c) as the server (apps/api/src/lib/payday-lib.ts):
//   no payday, or the 1st          → calendar months, exactly as before;
//   payday 2–15                    → a month is named by the month its period starts in;
//   payday 16–31                   → by the month after.
// A payday past a short month's end falls on that month's last day; the day is fixed (no weekend shift).
// This module imports nothing from the app, so utils.ts can build "today's month" on it without a cycle.

/** True for a payday that cuts months on its own day (2–31). */
export function paydayActive(payday: number | null | undefined): payday is number {
  return typeof payday === "number" && Number.isInteger(payday) && payday >= 2 && payday <= 31
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function shift(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** The key (YYYY-MM) of the month holding this date (YYYY-MM-DD). */
export function periodKeyForDate(payday: number | null | undefined, date: string): string {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  if (!paydayActive(payday)) return date.slice(0, 7)
  const d = Number(date.slice(8, 10))
  const [ky, km] = shift(y, m, (d >= Math.min(payday, daysIn(y, m)) ? 1 : 0) + (payday <= 15 ? -1 : 0))
  return `${ky}-${String(km).padStart(2, "0")}`
}

/** The inclusive first and last day of the month with this key. */
export function periodBoundsForKey(payday: number | null | undefined, key: string): { start: string; end: string } {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  if (!paydayActive(payday)) return { start: iso(y, m, 1), end: iso(y, m, daysIn(y, m)) }
  const [sy, sm] = payday <= 15 ? [y, m] : shift(y, m, -1)
  const [ny, nm] = shift(sy, sm, 1)
  const next = new Date(Date.UTC(ny, nm - 1, Math.min(payday, daysIn(ny, nm))) - 86_400_000)
  return { start: iso(sy, sm, Math.min(payday, daysIn(sy, sm))), end: next.toISOString().slice(0, 10) }
}

/** The month key one step from this one (keys step like calendar months under every payday). */
export function shiftKey(key: string, delta: number): string {
  const [y, m] = shift(Number(key.slice(0, 4)), Number(key.slice(5, 7)), delta)
  return `${y}-${String(m).padStart(2, "0")}`
}

// ── Her payday, as the profile last reported it ───────────────────────────────────────────────────────────
// Set by PaydaySync (inside the app shell) from the profile; null until then and on pages outside the shell,
// which is the calendar month, as before.
let currentPayday: number | null = null
const listeners = new Set<() => void>()

export function setPayday(payday: number | null | undefined): void {
  const next = typeof payday === "number" ? payday : null
  if (next === currentPayday) return
  currentPayday = next
  for (const l of listeners) l()
}

export function getPayday(): number | null {
  return currentPayday
}

/** Re-renders the caller when her payday changes. */
export function usePayday(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getPayday,
    getPayday,
  )
}

// ── Labels (MOB-R91 C4) ───────────────────────────────────────────────────────────────────────────────────
// With a payday that cuts months, a month is shown by its dates only, "25 Sep – 24 Oct"; a period that is not
// wholly in the current year adds the year once, at the end ("25 Dec – 24 Jan 2026"). Without one, callers keep
// the month name (these return null). Fixed short names: en-GB would write "Sept".
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

function dayMonth(date: string): string {
  return `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`
}

/** "25 Sep – 24 Oct" (or with the end year when not wholly in currentYear); null without a payday. */
export function periodLabel(payday: number | null | undefined, key: string, currentYear: number): string | null {
  if (!paydayActive(payday) || !/^\d{4}-\d{2}$/.test(key)) return null
  const { start, end } = periodBoundsForKey(payday, key)
  const label = `${dayMonth(start)} – ${dayMonth(end)}`
  const inYear = Number(start.slice(0, 4)) === currentYear && Number(end.slice(0, 4)) === currentYear
  return inYear ? label : `${label} ${end.slice(0, 4)}`
}

/** A chart axis tick: the period's first day, "25 Sep"; null without a payday. */
export function periodTick(payday: number | null | undefined, key: string): string | null {
  if (!paydayActive(payday) || !/^\d{4}-\d{2}$/.test(key)) return null
  return dayMonth(periodBoundsForKey(payday, key).start)
}

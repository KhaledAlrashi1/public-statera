// MOB-R70 C/E — the rules behind /log's "Receipt" layout (option A), kept pure so they can be
// tested without rendering. Strings are CHANNEL-DRAFTED and provisional under RM-26.
//
// The entry (C1): required = amount and category; optional = place, what for, date (today unless
// changed). Nothing else is required and nothing required is hidden.
import { storageKey } from "./demo/mode"

export type RequiredField = "amount" | "category"

/** The required fields still missing, always in the order amount, category. */
export function missingFields(amountOk: boolean, hasCategory: boolean): RequiredField[] {
  const out: RequiredField[] = []
  if (!amountOk) out.push("amount")
  if (!hasCategory) out.push("category")
  return out
}

/**
 * E4 — the FIRST missing field, which carries the "Next" tag: Category when a place is chosen and
 * Category is empty; else Amount (if missing); else Category (if missing); else nothing.
 */
export function firstMissing(placeChosen: boolean, amountOk: boolean, hasCategory: boolean): RequiredField | null {
  if (placeChosen && !hasCategory) return "category"
  if (!amountOk) return "amount"
  if (!hasCategory) return "category"
  return null
}

/** "an amount and a category", "an amount" or "a category" — the words E6 uses for what is missing. */
export function missingPhrase(missing: RequiredField[]): string {
  if (missing.length === 2) return "an amount and a category"
  return missing[0] === "amount" ? "an amount" : "a category"
}

/** E6 — the Save label while something required is missing ("Add an amount", …). */
export function missingSaveLabel(missing: RequiredField[]): string {
  return `Add ${missingPhrase(missing)}`
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A local date as YYYY-MM-DD (the browser's own calendar day). */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** "Sat 3 Oct" — the chip label for a day in the last two weeks. */
export function shortDayLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

// MOB-R73 E3 (operator, B1 item 3) — today and the 7 days before: "Today", "Yesterday", then 6.
export const RECENT_DAY_CHIPS = 6

/** E5 Date — "Today", "Yesterday", then the 6 days before (8 chips), newest first. Never a future day. */
export function recentDateChips(today: Date): Array<{ iso: string; label: string }> {
  const chips: Array<{ iso: string; label: string }> = []
  for (let i = 0; i < 2 + RECENT_DAY_CHIPS; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    chips.push({ iso: localIso(d), label: i === 0 ? "Today" : i === 1 ? "Yesterday" : shortDayLabel(d) })
  }
  return chips
}

/** E7 — per device: the browser-clock date of the last first-save burst. */
export const LOG_FIRST_SAVE_KEY = "statera.log.first-save-date"

/**
 * True for the first save of the day on this device, and records the day so later saves that day
 * return false. Storage that cannot be read or written means no burst (the quiet answer).
 */
export function claimFirstSaveOfDay(todayIso: string): boolean {
  try {
    if (window.localStorage.getItem(storageKey(LOG_FIRST_SAVE_KEY)) === todayIso) return false
    window.localStorage.setItem(storageKey(LOG_FIRST_SAVE_KEY), todayIso)
    return true
  } catch {
    return false
  }
}

/** Reduced motion, or no way to ask (jsdom, very old browsers): the static, quiet answer. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

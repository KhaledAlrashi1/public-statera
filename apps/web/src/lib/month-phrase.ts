import { currentMonthKeyNow, labelForYM } from "./utils"

// MOB-R89 B1 — the month as it reads mid-sentence, from the month KEY (never the label): "this month" for
// Kuwait's current month (RM-28), else the label's text ("September 2026"). MOB-R91 C3: the current month follows
// her payday (currentMonthKeyNow is the calendar month when none is set).
export function monthPhraseFor(monthKey: string): string {
  return monthKey === currentMonthKeyNow() ? "this month" : labelForYM(monthKey)
}

import { kuwaitNow, labelForYM } from "./utils"

// MOB-R89 B1 — the month as it reads mid-sentence, from the month KEY (never the label): "this month" for
// Kuwait's current month (RM-28), else the label's text ("September 2026").
export function monthPhraseFor(monthKey: string): string {
  const now = kuwaitNow()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return monthKey === current ? "this month" : labelForYM(monthKey)
}

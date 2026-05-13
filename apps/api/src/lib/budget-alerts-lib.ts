import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import type { getDb } from "../db/connection"
import { productEvents } from "../db/schema/product-events"
import { formatKd } from "./kd"

type Db = ReturnType<typeof getDb>

export const BUDGET_ALERT_EVENT_NAME = "budget_alert"
export const BUDGET_ALERT_DISMISSED_EVENT_NAME = "budget_alert_dismissed"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function buildBudgetAlertKey(monthKey: string, categoryId: number): string {
  return `${monthKey}:${categoryId}`
}

function parseEventProperties(propertiesJson: string | null): Record<string, unknown> {
  if (!propertiesJson) return {}
  try {
    const parsed: unknown = JSON.parse(propertiesJson)
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// Extract [alertKey, month] from a budget_alert event's properties_json.
// Returns [null, null] when properties are missing or malformed.
export function parseBudgetAlertIdentity(
  propertiesJson: string | null,
): [string | null, string | null] {
  const props = parseEventProperties(propertiesJson)
  let key = String(props["alert_key"] ?? "").trim()
  let month = String(props["month"] ?? "").trim()

  if (!month && key) {
    // alertKey format is "YYYY-MM:categoryId" — first colon separates the month.
    const firstColon = key.indexOf(":")
    const candidate = firstColon > 0 ? key.slice(0, firstColon) : ""
    if (MONTH_RE.test(candidate)) month = candidate
  }

  if (!key && month) {
    const categoryId = parseInt(String(props["category_id"] ?? ""), 10)
    if (!Number.isNaN(categoryId) && categoryId > 0) {
      key = buildBudgetAlertKey(month, categoryId)
    }
  }

  if (!key || !month || !MONTH_RE.test(month)) return [null, null]
  return [key, month]
}

// Returns two composite-key sets for the given month:
//   existing:  "${userId}||${alertKey}" for already-created alerts
//   dismissed: "${userId}||${alertKey}" for user-dismissed alerts
// Looks back 120 days before month start to catch alerts created near month
// boundaries, matching Flask's collect_month_alert_key_sets window.
export async function collectMonthAlertKeySets(
  monthKey: string,
  db: Db,
): Promise<{ existing: Set<string>; dismissed: Set<string> }> {
  const [year, month] = monthKey.split("-").map(Number) as [number, number]
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const lookupStart = new Date(monthStart.getTime() - 120 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      userId: productEvents.userId,
      eventName: productEvents.eventName,
      propertiesJson: productEvents.propertiesJson,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [
          BUDGET_ALERT_EVENT_NAME,
          BUDGET_ALERT_DISMISSED_EVENT_NAME,
        ]),
        gte(productEvents.eventTs, lookupStart),
      ),
    )

  const existing = new Set<string>()
  const dismissed = new Set<string>()

  for (const row of rows) {
    const [key, eventMonth] = parseBudgetAlertIdentity(row.propertiesJson)
    if (!key || eventMonth !== monthKey || !row.userId) continue
    const pair = `${row.userId}||${key}`
    if (row.eventName === BUDGET_ALERT_DISMISSED_EVENT_NAME) {
      dismissed.add(pair)
    } else if (row.eventName === BUDGET_ALERT_EVENT_NAME) {
      existing.add(pair)
    }
  }

  return { existing, dismissed }
}

export async function loadDismissedBudgetAlertKeys(
  userId: number,
  monthKey: string,
  db: Db,
): Promise<Set<string>> {
  const rows = await db
    .select({ propertiesJson: productEvents.propertiesJson })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.userId, userId),
        eq(productEvents.eventName, BUDGET_ALERT_DISMISSED_EVENT_NAME),
      ),
    )
    .orderBy(desc(productEvents.id))
    .limit(1000)

  const dismissed = new Set<string>()
  for (const row of rows) {
    const [key, month] = parseBudgetAlertIdentity(row.propertiesJson)
    if (key && month === monthKey) dismissed.add(key)
  }
  return dismissed
}

// Public API contract — matches Flask's list_active_budget_alerts item shape.
export interface BudgetAlertItem {
  id: number
  type: "budget_alert"
  alert_key: string
  month: string
  category: string
  category_id: number | null
  budget_kd: string
  spent_kd: string
  ratio: number
  threshold: number
  created_at: string | null
}

function safeFloat(value: unknown, defaultVal: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : defaultVal
}

function safeInt(value: unknown): number | null {
  const n = parseInt(String(value ?? ""), 10)
  return Number.isNaN(n) ? null : n
}

function safeMoneyStr(value: unknown): string {
  return formatKd(String(value ?? "0"))
}

// List active (non-dismissed) budget alerts for the given user and month.
// Reads up to 2000 recent alert/dismissed events and processes them in JS,
// matching Flask's list_active_budget_alerts approach.
export async function listActiveBudgetAlerts(
  userId: number,
  monthKey: string,
  db: Db,
  opts?: { limit?: number },
): Promise<BudgetAlertItem[]> {
  const limit = Math.max(1, Math.min(Number(opts?.limit ?? 20) || 20, 100))

  const rows = await db
    .select({
      id: productEvents.id,
      eventName: productEvents.eventName,
      propertiesJson: productEvents.propertiesJson,
      eventTs: productEvents.eventTs,
    })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.userId, userId),
        inArray(productEvents.eventName, [
          BUDGET_ALERT_EVENT_NAME,
          BUDGET_ALERT_DISMISSED_EVENT_NAME,
        ]),
      ),
    )
    .orderBy(desc(productEvents.eventTs), desc(productEvents.id))
    .limit(2000)

  const dismissedKeys = new Set<string>()
  const alertsByKey = new Map<string, BudgetAlertItem>()

  for (const row of rows) {
    const [key, eventMonth] = parseBudgetAlertIdentity(row.propertiesJson)
    if (!key || eventMonth !== monthKey) continue
    const props = parseEventProperties(row.propertiesJson)

    if (row.eventName === BUDGET_ALERT_DISMISSED_EVENT_NAME) {
      dismissedKeys.add(key)
      continue
    }
    if (row.eventName !== BUDGET_ALERT_EVENT_NAME || alertsByKey.has(key)) continue

    const ratio = safeFloat(props["ratio"], 0)
    const threshold = safeFloat(props["threshold"], 0.9)
    const category =
      String(props["category"] ?? "Uncategorized").trim().slice(0, 64) || "Uncategorized"
    const eventTs = row.eventTs

    alertsByKey.set(key, {
      id: row.id,
      type: "budget_alert",
      alert_key: key,
      month: monthKey,
      category,
      category_id: safeInt(props["category_id"]),
      budget_kd: safeMoneyStr(props["budget_kd"]),
      spent_kd: safeMoneyStr(props["spent_kd"]),
      ratio: Math.round(ratio * 10000) / 10000,
      threshold: Math.round(threshold * 10000) / 10000,
      created_at:
        eventTs instanceof Date
          ? eventTs.toISOString().replace(/\.\d{3}Z$/, "+00:00")
          : null,
    })
  }

  const items = Array.from(alertsByKey.values())
    .filter((item) => !dismissedKeys.has(item.alert_key))
  items.sort(
    (a, b) =>
      b.ratio - a.ratio ||
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )
  return items.slice(0, limit)
}

// Format "YYYY-MM" → "Month YYYY" (e.g., "2026-05" → "May 2026").
export function formatMonthLabel(monthKey: string): string {
  const raw = (monthKey || "").trim()
  try {
    const [year, month] = raw.split("-").map(Number) as [number, number]
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  } catch {
    return raw
  }
}

// Round to 4 decimal places, matching Flask's round(ratio, 4).
export function roundRatio(ratio: Decimal, budgetKd: Decimal): number {
  if (budgetKd.lte(0)) return 0
  return parseFloat(ratio.div(budgetKd).toFixed(4))
}

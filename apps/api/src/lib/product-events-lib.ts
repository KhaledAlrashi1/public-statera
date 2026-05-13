import { and, eq, gte, lt } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { productEvents } from "../db/schema/product-events"
import { Sentry } from "./sentry"

type Db = ReturnType<typeof getDb>

export async function hasEvent(userId: number, eventName: string, db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: productEvents.id })
    .from(productEvents)
    .where(and(eq(productEvents.userId, userId), eq(productEvents.eventName, eventName)))
    .limit(1)
  return !!row
}

export async function hasEventBetween(
  userId: number,
  eventName: string,
  startTs: Date,
  endTsExclusive: Date,
  db: Db,
): Promise<boolean> {
  const [row] = await db
    .select({ id: productEvents.id })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.userId, userId),
        eq(productEvents.eventName, eventName),
        gte(productEvents.eventTs, startTs),
        lt(productEvents.eventTs, endTsExclusive),
      ),
    )
    .limit(1)
  return !!row
}

export async function recordEvent(
  userId: number,
  eventName: string,
  properties: Record<string, unknown> | null,
  db: Db,
): Promise<boolean> {
  try {
    await db.insert(productEvents).values({
      userId,
      eventName: eventName.slice(0, 64),
      propertiesJson: properties != null ? JSON.stringify(properties) : null,
    })
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { fn: "recordEvent", eventName, userId } })
    console.error("[product-events] recordEvent failed eventName=%s userId=%d:", eventName, userId, err)
    return false
  }
}

export async function recordEventOnce(
  userId: number,
  eventName: string,
  properties: Record<string, unknown> | null,
  db: Db,
): Promise<boolean> {
  try {
    if (await hasEvent(userId, eventName, db)) return false
    await db.insert(productEvents).values({
      userId,
      eventName: eventName.slice(0, 64),
      propertiesJson: properties != null ? JSON.stringify(properties) : null,
    })
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { fn: "recordEventOnce", eventName, userId } })
    console.error("[product-events] recordEventOnce failed eventName=%s userId=%d:", eventName, userId, err)
    return false
  }
}

// Deliberate race: two concurrent requests on the same user+day both pass
// hasEventBetween and both insert. Flask has the same race — tolerated because
// daily event counts are a soft signal and a stray duplicate per user per day
// is in the noise floor for activation metrics.
export async function recordEventDaily(
  userId: number,
  eventName: string,
  properties: Record<string, unknown> | null,
  db: Db,
  opts?: { nowUtc?: Date },
): Promise<boolean> {
  try {
    const now = opts?.nowUtc ?? new Date()
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    if (await hasEventBetween(userId, eventName, dayStart, dayEnd, db)) return false
    // nowUtc drives both the window check and the inserted eventTs so tests can
    // pin time without relying on the DB's CURRENT_TIMESTAMP default drifting.
    await db.insert(productEvents).values({
      userId,
      eventName: eventName.slice(0, 64),
      propertiesJson: properties != null ? JSON.stringify(properties) : null,
      eventTs: now,
    })
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { fn: "recordEventDaily", eventName, userId } })
    console.error("[product-events] recordEventDaily failed eventName=%s userId=%d:", eventName, userId, err)
    return false
  }
}

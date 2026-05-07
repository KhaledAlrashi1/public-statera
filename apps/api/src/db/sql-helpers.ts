import { sql } from "drizzle-orm"
import type { Column } from "drizzle-orm"

// Drizzle MySQL does not yet support .nullsLast() on order expressions.
// This helper emits ISNULL(col), col DESC which places non-null values first
// and sorts them descending — equivalent to SQLAlchemy's .desc().nullslast().
//
// TODO: replace with native .nullsLast() when Drizzle MySQL adds support.
export function nullsLastDesc(col: Column) {
  return sql`ISNULL(${col}), ${col} DESC`
}

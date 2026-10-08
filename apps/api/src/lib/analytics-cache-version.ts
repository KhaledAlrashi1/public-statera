// MOB-R60 C3 — the Redis payloads for R3 (dashboard_metrics:) and R9 (safe_to_spend:) are
// versioned, so an entry computed under an older rule is never read; it simply expires on its own
// TTL. No delete. The version is a suffix added where each key is used, so the key builders in
// analytics-cache.ts (and the tests that pin their output) are unchanged, and the bust patterns
// `dashboard_metrics:{userId}:*` / `safe_to_spend:{userId}:*` still match every versioned key.
//
// Bump ANALYTICS_CACHE_VERSION whenever what R3 or R9 computes changes.
// v2: MOB-R55 K1 — savings-kind categories leave every expense total.
export const ANALYTICS_CACHE_VERSION = "v2"

// MOB-R91 C2 — a payday that cuts months (2–31) is part of what R3 and R9 compute, so it is part of the version:
// ":v2:p25". With no payday (or the 1st) the key is exactly what it was. A payday change also clears both prefixes
// and the user's snapshot rows (auth.ts /profile/update), so an entry computed under the old payday is never read.
export function versionedCacheKey(key: string, payday?: number | null): string {
  const p = typeof payday === "number" && Number.isInteger(payday) && payday >= 2 && payday <= 31 ? `:p${payday}` : ""
  return `${key}:${ANALYTICS_CACHE_VERSION}${p}`
}

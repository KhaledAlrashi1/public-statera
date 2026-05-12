// Shared route utility helpers. Consolidated from aggregation.ts and intelligence.ts in 5c-3.

export function parseIntParam(v: string | undefined, defaultVal: number): number {
  if (!v) return defaultVal
  const n = parseInt(v, 10)
  return isNaN(n) ? defaultVal : n
}

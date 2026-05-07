/**
 * buildNameKey — deterministic string normalizer used as the duplicate-check
 * key for transactions. Port of Flask's build_name_key():
 *
 *   " ".join((name or "").split()).lower()[:255] or "?"
 *
 * Two hardening changes over a naive JS port:
 *   - /u flag on whitespace regex: Unicode-aware splitting (matches Python's
 *     str.split() which splits on Unicode Zs-category characters including NBSP).
 *   - Slice by code points ([...s].slice(0,255)) not UTF-16 code units:
 *     Python's [:255] counts code points; JS .slice(0,255) counts code units.
 *     For supplementary characters (e.g. emoji in names) these diverge.
 */
export function buildNameKey(name: string | null | undefined): string {
  const joined = (name ?? "")
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return ([...joined].slice(0, 255).join("")) || "?"
}

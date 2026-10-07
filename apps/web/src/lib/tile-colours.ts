// MOB-R81 C6 / MOB-R82 C4 — the colour of a place's square, shared by /log's tiles and Activity's rows so a
// place keeps one colour on both. Five colours from the chart tokens; a name hashes to its preferred one.
// /log additionally keeps its visible tiles apart (assignTileColours, LogPage.tsx); a list cannot, so two
// names may share a colour.
export const TILE_COLOURS = ["bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7"]

export function preferredColourIndex(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % TILE_COLOURS.length
}

/** The square's colour for a name, with no other names to keep apart from. */
export function nameColour(name: string): string {
  return TILE_COLOURS[preferredColourIndex(name)]
}

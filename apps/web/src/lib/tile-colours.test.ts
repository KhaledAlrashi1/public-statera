// MOB-R82 C4 — one module holds the square's colours and name hash; /log and Activity both import it, so a
// place has one colour on both pages and no copy of the hash exists.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { assignTileColours, TILE_COLOURS as LOG_TILE_COLOURS } from "@/components/pages/LogPage"
import { nameColour, preferredColourIndex, TILE_COLOURS } from "./tile-colours"

describe("shared tile colours (MOB-R82 C4)", () => {
  it("/log's colours are the shared module's (same array), and a lone place gets its name's colour on both", () => {
    expect(LOG_TILE_COLOURS).toBe(TILE_COLOURS)
    for (const name of ["Talabat", "Carrefour", "Pick", "Netflix", "% Arabica"]) {
      expect(assignTileColours([name]).get(name)).toBe(nameColour(name))
      expect(nameColour(name)).toBe(TILE_COLOURS[preferredColourIndex(name)])
    }
  })

  it("no copy: neither page defines the hash or the palette itself", () => {
    const log = readFileSync(resolve(process.cwd(), "src/components/pages/LogPage.tsx"), "utf8")
    const activity = readFileSync(resolve(process.cwd(), "src/components/pages/transactions/TransactionsTable.tsx"), "utf8")
    for (const src of [log, activity]) {
      expect(src).not.toMatch(/charCodeAt\(0\)\) >>> 0/)
      expect(src).not.toMatch(/\["bg-chart-3", "bg-chart-4"/)
      expect(src).toMatch(/from "@\/lib\/tile-colours"/)
    }
  })
})

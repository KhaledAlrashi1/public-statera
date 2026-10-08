// MOB-R78 E — the status bar. A browser has no safe-area inset, so these cases pin the shape in the source
// (class census): one value, --safe-top, defined once; one fixed strip of the page background that tall,
// mounted for every route; the app's top padded by it; every element that was anchored at the top moved
// down by it. The rendered check on a phone-sized inset is the scratch Playwright probe (E5).
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SafeTopStrip } from "./SafeTopStrip"

const sources = import.meta.glob(["/src/**/*.{ts,tsx,css}", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>
const src = (path: string) => {
  const text = sources[path]
  if (text === undefined) throw new Error(`no source at ${path}`)
  return text
}
const lineWith = (path: string, marker: string) => {
  const lines = src(path).split("\n").filter((l) => l.includes(marker))
  expect(lines, `${path}: one line containing ${marker}`).toHaveLength(1)
  return lines[0]
}

describe("status bar: --safe-top and its strip (MOB-R78 E)", () => {
  it("--safe-top is defined once, from the inset, and nothing else reads the inset directly", () => {
    const definitions = Object.entries(sources).flatMap(([path, text]) =>
      text.split("\n").filter((l) => /--safe-top\s*:/.test(l)).map((l) => `${path}: ${l.trim()}`),
    )
    expect(definitions).toEqual(["/src/index.css: --safe-top: env(safe-area-inset-top, 0px);"])
    const directReaders = Object.entries(sources)
      .filter(([, text]) => text.includes("safe-area-inset-top"))
      .map(([path]) => path)
    expect(directReaders).toEqual(["/src/index.css"])
  })

  it("one fixed strip of the page background, as tall as --safe-top, above everything, on every route", () => {
    render(<SafeTopStrip />)
    const strip = screen.getByTestId("safe-top-strip")
    for (const cls of ["fixed", "inset-x-0", "top-0", "h-[var(--safe-top)]", "bg-background", "pointer-events-none", "z-[10000]"]) {
      expect(strip.className.split(/\s+/)).toContain(cls)
    }
    expect(strip).toHaveAttribute("aria-hidden", "true")
    // Mounted once, inside the router and outside every route, so /log and the pages in AppShell both get it.
    expect(src("/src/App.tsx").match(/<SafeTopStrip \/>/g)).toHaveLength(1)
  })

  it("the app's top is padded by --safe-top, and what sat at the top moved down by it", () => {
    expect(lineWith("/src/components/layout/AppShell.tsx", "relative min-h-screen bg-background")).toContain("pt-[var(--safe-top)]")
    expect(lineWith("/src/components/pages/LogPage.tsx", "mx-auto flex min-h-full")).toContain("pt-[calc(1rem+var(--safe-top))]")
    const header = lineWith("/src/components/layout/AppShell.tsx", "sticky top-")
    expect(header).toContain("sticky top-[var(--safe-top)]")
    expect(src("/src/components/layout/AppShell.tsx")).toContain("fixed right-0 top-[var(--safe-top)] bottom-0")
    expect(src("/src/components/layout/AppShell.tsx")).toContain("focus:top-[calc(1rem+var(--safe-top))]")
    expect(lineWith("/src/components/ui/toaster.tsx", "pointer-events-none fixed end-4")).toContain("top-[calc(1rem+var(--safe-top))]")
    expect(lineWith("/src/components/pages/TransactionsPage.tsx", "var(--header-h")).toContain("top-[calc(var(--safe-top)+var(--header-h,64px))]")
  })
})

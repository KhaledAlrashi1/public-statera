// MOB-R79 E — the pages outside AppShell pad their own top by --safe-top, so the status bar strip
// (MOB-R78 E) never covers their first content in the installed app. Class census in the source, one case
// per page; the rendered check on a phone-sized inset is the scratch Playwright probe (E2). Pages with their
// own top padding (p-6, py-10) keep it and add the inset, so with no inset nothing moves.
import { describe, expect, it } from "vitest"

const sources = import.meta.glob(["/src/components/pages/**/*.tsx", "!/src/**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

const PAGES: ReadonlyArray<[page: string, path: string, marker: string, cls: string, tops: number]> = [
  ["/login", "/src/components/pages/LoginPage.tsx", "relative min-h-screen overflow-hidden bg-background", "pt-[var(--safe-top)]", 1],
  ["/auth/2fa-verify", "/src/components/pages/TwoFactorVerifyPage.tsx", "flex min-h-screen items-center justify-center bg-background p-6", "pt-[calc(1.5rem+var(--safe-top))]", 1],
  ["/auth/magic", "/src/components/pages/MagicLinkPage.tsx", "flex min-h-screen items-center justify-center bg-background p-6", "pt-[calc(1.5rem+var(--safe-top))]", 1],
  ["/delete-account/confirm (both branches)", "/src/components/pages/DeleteAccountConfirmPage.tsx", "flex min-h-screen items-center justify-center bg-background p-6", "pt-[calc(1.5rem+var(--safe-top))]", 2],
  ["/privacy and /terms", "/src/components/pages/legal/LegalPageLayout.tsx", "relative min-h-screen overflow-hidden bg-background", "pt-[var(--safe-top)]", 1],
  ["/welcome", "/src/components/pages/WorkspaceChoicePage.tsx", "relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10", "pt-[calc(2.5rem+var(--safe-top))]", 1],
]

describe("tops outside the shell pad by --safe-top (MOB-R79 E)", () => {
  it.each(PAGES)("%s", (_page, path, marker, cls, tops) => {
    const text = sources[path]
    expect(text, `no source at ${path}`).toBeDefined()
    const lines = text.split("\n").filter((l) => l.includes(marker))
    expect(lines).toHaveLength(tops)
    for (const l of lines) expect(l.split(/["\s]+/)).toContain(cls)
  })
})

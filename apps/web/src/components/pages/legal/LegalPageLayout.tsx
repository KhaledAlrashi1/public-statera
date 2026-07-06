/*
 * LegalPageLayout — shared frame for the public (pre-auth) legal pages
 * (/privacy, /terms). Standalone; deliberately NOT the auth-gated AppShell.
 *
 * The pages carry the final operator-approved legal copy (10c-content). Each
 * page passes its own effective date via the `lastUpdated` prop.
 *
 * Arabic fast-follow lands HERE: the RTL treatment and the language switch
 * (English/العربية) belong in this layout so both legal pages inherit them in
 * one place. When that work starts, add a `dir` toggle + a lang switcher to this
 * header and thread a locale down to the page bodies — do not fork per-page.
 */

import { Link } from "react-router-dom"
import { Scale } from "lucide-react"

type LegalPageLayoutProps = {
  title: string
  /** Placeholder until content-track supplies the effective date. */
  lastUpdated?: string
  children: React.ReactNode
}

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 app-surface" />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <header className="section-panel p-7">
          <div className="flex items-center gap-3">
            <div className="icon-shell h-11 w-11 border-primary/20 bg-primary/10 text-primary">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Statera
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: {lastUpdated ?? "pending"}
          </p>
        </header>

        <main className="section-panel p-7">{children}</main>

        <footer className="px-1 text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            ← Back to sign in
          </Link>
        </footer>
      </div>
    </div>
  )
}

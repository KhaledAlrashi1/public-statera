/*
 * PrivacyPolicyPage — public (pre-auth) route /privacy.
 *
 * 10c-2 ships STRUCTURE ONLY: section scaffolds with visible "content pending
 * operator review" markers. No drafted legal prose — copy arrives via the
 * operator-owned content track.
 *
 * The "Data handling" section carries two commitment slots (plain sections with
 * stable data-testids) that MUST render the factual commitments recorded in the
 * "10c content-track facts" note when copy lands:
 *   - commitment-backup-retention  → 365-day encrypted-backup retention (disclosed
 *     as-is, never shortened for copy convenience).
 *   - commitment-statement-files   → uploaded statement files are never persisted
 *     (parse-and-discard; only derived transaction rows persist).
 * The tests assert both slots are present; that is the durable guarantee this
 * legally load-bearing content can't be silently dropped in a future edit.
 */

import LegalPageLayout from "./LegalPageLayout"

const PENDING = "TODO: content pending operator review"

function PlaceholderMarker() {
  return (
    <p className="mt-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
      {PENDING}
    </p>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <div className="space-y-8">
        <section aria-labelledby="section-introduction">
          <h2 id="section-introduction" className="text-lg font-semibold text-foreground">
            Introduction
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="section-information-we-collect">
          <h2 id="section-information-we-collect" className="text-lg font-semibold text-foreground">
            Information we collect
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="section-how-we-use-your-information">
          <h2
            id="section-how-we-use-your-information"
            className="text-lg font-semibold text-foreground"
          >
            How we use your information
          </h2>
          <PlaceholderMarker />
        </section>

        {/* Data handling — hosts the two load-bearing factual-commitment slots. */}
        <section aria-labelledby="section-data-handling">
          <h2 id="section-data-handling" className="text-lg font-semibold text-foreground">
            Data handling
          </h2>

          <div data-testid="commitment-backup-retention" className="mt-3">
            <h3 className="text-base font-semibold text-foreground">Backup retention</h3>
            <PlaceholderMarker />
          </div>

          <div data-testid="commitment-statement-files" className="mt-4">
            <h3 className="text-base font-semibold text-foreground">Uploaded statement files</h3>
            <PlaceholderMarker />
          </div>
        </section>

        <section aria-labelledby="section-data-retention">
          <h2 id="section-data-retention" className="text-lg font-semibold text-foreground">
            Data retention
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="section-your-rights">
          <h2 id="section-your-rights" className="text-lg font-semibold text-foreground">
            Your rights (access and deletion)
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="section-third-party-services">
          <h2 id="section-third-party-services" className="text-lg font-semibold text-foreground">
            Third-party services
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="section-contact">
          <h2 id="section-contact" className="text-lg font-semibold text-foreground">
            Contact
          </h2>
          <PlaceholderMarker />
        </section>
      </div>
    </LegalPageLayout>
  )
}

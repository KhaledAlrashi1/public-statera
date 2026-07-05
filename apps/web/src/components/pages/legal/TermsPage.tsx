/*
 * TermsPage — public (pre-auth) route /terms.
 *
 * 10c-2 ships STRUCTURE ONLY: section scaffolds with visible "content pending
 * operator review" markers. No drafted legal prose — copy arrives via the
 * operator-owned content track.
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

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <div className="space-y-8">
        <section aria-labelledby="terms-introduction">
          <h2 id="terms-introduction" className="text-lg font-semibold text-foreground">
            Introduction and acceptance
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-service">
          <h2 id="terms-service" className="text-lg font-semibold text-foreground">
            Description of the service
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-responsibilities">
          <h2 id="terms-responsibilities" className="text-lg font-semibold text-foreground">
            User responsibilities
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-acceptable-use">
          <h2 id="terms-acceptable-use" className="text-lg font-semibold text-foreground">
            Acceptable use
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-disclaimers">
          <h2 id="terms-disclaimers" className="text-lg font-semibold text-foreground">
            Disclaimers
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-liability">
          <h2 id="terms-liability" className="text-lg font-semibold text-foreground">
            Limitation of liability
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-changes">
          <h2 id="terms-changes" className="text-lg font-semibold text-foreground">
            Changes to these terms
          </h2>
          <PlaceholderMarker />
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact" className="text-lg font-semibold text-foreground">
            Contact
          </h2>
          <PlaceholderMarker />
        </section>
      </div>
    </LegalPageLayout>
  )
}

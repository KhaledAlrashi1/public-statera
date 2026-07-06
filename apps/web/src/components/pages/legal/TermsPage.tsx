/*
 * TermsPage — public (pre-auth) route /terms.
 *
 * 10c-content: carries the final, operator-approved Terms of Service copy.
 */

import LegalPageLayout from "./LegalPageLayout"

const LAST_UPDATED = "6 July 2026"

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section aria-labelledby="terms-agreement">
          <h2 id="terms-agreement" className="text-lg font-semibold text-foreground">
            1. Agreement
          </h2>
          <p className="mt-2">
            By creating an account or using Statera (staterafinance.app), you agree to these terms.
            Statera is operated by Khaled AlRashidi in the State of Kuwait (&ldquo;Statera&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;). If you do not agree, do not use the service.
          </p>
        </section>

        <section aria-labelledby="terms-what-statera-is">
          <h2 id="terms-what-statera-is" className="text-lg font-semibold text-foreground">
            2. What Statera is — and is not
          </h2>
          <p className="mt-2">
            Statera is a personal finance tracking tool: you record your own transactions, budgets,
            debts, and savings goals, and Statera organizes and summarizes them for you.
          </p>
          <p className="mt-2">
            Statera is <span className="font-semibold text-foreground">not</span> financial,
            investment, tax, or legal advice. Numbers, projections, and suggestions shown in the app
            (including &ldquo;safe to spend&rdquo; figures and debt payoff projections) are
            calculations based solely on the data you entered. They may be wrong if your data is
            incomplete, and they are not a recommendation to make any financial decision. You are
            responsible for your own financial choices.
          </p>
          <p className="mt-2">
            Statera does not connect to your bank, cannot move money, and cannot see your real
            accounts.
          </p>
        </section>

        <section aria-labelledby="terms-your-account">
          <h2 id="terms-your-account" className="text-lg font-semibold text-foreground">
            3. Your account
          </h2>
          <p className="mt-2">
            You must be at least 18 years old to use Statera. You sign in through a supported
            identity provider (currently Google) and are responsible for keeping that account
            secure. We recommend enabling two-factor authentication in your security settings.
          </p>
        </section>

        <section aria-labelledby="terms-acceptable-use">
          <h2 id="terms-acceptable-use" className="text-lg font-semibold text-foreground">
            4. Acceptable use
          </h2>
          <p className="mt-2">
            Use Statera only for its intended purpose — managing your own personal finances. Do not
            attempt to access other users&rsquo; data, probe or disrupt the service, upload malicious
            content, or use the service for anything unlawful. We may suspend or terminate accounts
            that do.
          </p>
        </section>

        <section aria-labelledby="terms-your-data">
          <h2 id="terms-your-data" className="text-lg font-semibold text-foreground">
            5. Your data
          </h2>
          <p className="mt-2">
            Your financial data belongs to you. Our handling of it is described in the Privacy
            Policy, which is part of these terms. You can export or delete your data at any time from
            your profile.
          </p>
        </section>

        <section aria-labelledby="terms-availability-warranty">
          <h2 id="terms-availability-warranty" className="text-lg font-semibold text-foreground">
            6. Availability and warranty
          </h2>
          <p className="mt-2">
            Statera is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind, express or implied. We work to keep the service reliable and your
            data safe (including encrypted backups), but we do not guarantee uninterrupted
            availability or that the service will be free of errors. We recommend keeping your own
            export of important data.
          </p>
        </section>

        <section aria-labelledby="terms-liability">
          <h2 id="terms-liability" className="text-lg font-semibold text-foreground">
            7. Limitation of liability
          </h2>
          <p className="mt-2">
            To the maximum extent permitted by the laws of Kuwait, we are not liable for indirect,
            incidental, or consequential damages arising from your use of Statera, including
            financial decisions made in reliance on figures shown in the app. Nothing in these terms
            excludes liability that cannot be excluded under applicable law.
          </p>
        </section>

        <section aria-labelledby="terms-termination">
          <h2 id="terms-termination" className="text-lg font-semibold text-foreground">
            8. Termination
          </h2>
          <p className="mt-2">
            You can delete your account at any time from your profile. We may suspend or terminate
            accounts that violate these terms; where reasonable, we will warn you first. Sections
            that by their nature should survive termination (including §7) survive.
          </p>
        </section>

        <section aria-labelledby="terms-governing-law">
          <h2 id="terms-governing-law" className="text-lg font-semibold text-foreground">
            9. Governing law
          </h2>
          <p className="mt-2">
            These terms are governed by the laws of the State of Kuwait, and any dispute is subject
            to the jurisdiction of the courts of Kuwait.
          </p>
        </section>

        <section aria-labelledby="terms-changes">
          <h2 id="terms-changes" className="text-lg font-semibold text-foreground">
            10. Changes to these terms
          </h2>
          <p className="mt-2">
            If these terms change, we will update the &ldquo;Last updated&rdquo; date above. Material
            changes will be announced in the app before they take effect.
          </p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact" className="text-lg font-semibold text-foreground">
            11. Contact
          </h2>
          <p className="mt-2">privacy@staterafinance.app</p>
        </section>
      </div>
    </LegalPageLayout>
  )
}

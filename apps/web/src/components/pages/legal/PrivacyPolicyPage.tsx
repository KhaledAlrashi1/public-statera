/*
 * PrivacyPolicyPage — public (pre-auth) route /privacy.
 *
 * 10c-content: carries the final, operator-approved Privacy Policy copy.
 *
 * Two commitment slots (plain sections with stable data-testids) render the
 * legally load-bearing factual commitments, and the tests assert their CONTENT
 * (not just presence) so a future edit can't silently drop or weaken them:
 *   - commitment-backup-retention (§7) → 365-day encrypted-backup retention +
 *     the re-deletion-on-restore promise (disclosed as-is, never shortened).
 *   - commitment-statement-files (§4) → uploaded statement files are never
 *     stored (parse-and-discard; only derived transaction rows persist).
 */

import LegalPageLayout from "./LegalPageLayout"

const LAST_UPDATED = "6 July 2026"

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section aria-labelledby="section-who-we-are">
          <h2 id="section-who-we-are" className="text-lg font-semibold text-foreground">
            1. Who we are
          </h2>
          <p className="mt-2">
            Statera (staterafinance.app) is a personal finance application operated by Khaled
            AlRashidi in the State of Kuwait (&ldquo;Statera&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;). You can contact us about anything in this policy at
            privacy@staterafinance.app.
          </p>
          <p className="mt-2">
            This policy explains what data Statera collects, why, where it is stored, and the
            rights you have over it. We process your data on the basis of your consent and only for
            the purposes described here, consistent with Kuwait&rsquo;s Electronic Transactions Law
            No. 20 of 2014 and its Executive Regulations.
          </p>
        </section>

        <section aria-labelledby="section-what-we-collect">
          <h2 id="section-what-we-collect" className="text-lg font-semibold text-foreground">
            2. What we collect
          </h2>
          <p className="mt-2">
            Statera stores only what you put into it, plus the minimum needed to run your account:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-foreground">Account data:</span> your name and
              email address as provided by your sign-in provider (Google), and your security
              settings (whether two-factor authentication is enabled).
            </li>
            <li>
              <span className="font-semibold text-foreground">Profile data:</span> preferences you
              set in the app, such as income, payday, and country settings.
            </li>
            <li>
              <span className="font-semibold text-foreground">Financial data you enter:</span>{" "}
              transactions, categories, merchants, and budgets. Amounts are stored in
              Kuwaiti dinars exactly as you enter them.
            </li>
            <li>
              <span className="font-semibold text-foreground">Learned suggestions:</span> when you
              log transactions, Statera learns merchant and category patterns to speed up future
              entry. These learned patterns are stored with your account. Deleting a transaction
              does not automatically delete patterns learned from it; you can view and delete
              learned patterns in the app at any time.
            </li>
            <li>
              <span className="font-semibold text-foreground">Security and usage records:</span> a
              log of security-relevant events on your account (such as sign-ins and profile changes)
              and first-party records of feature usage. These stay in our own database; see §5 — we
              use no third-party analytics.
            </li>
          </ul>
        </section>

        <section aria-labelledby="section-what-we-do-not-collect">
          <h2
            id="section-what-we-do-not-collect"
            className="text-lg font-semibold text-foreground"
          >
            3. What we do not collect
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-foreground">No passwords.</span> Statera has no
              password database. You sign in through your identity provider; we never see or store a
              password.
            </li>
            <li>
              <span className="font-semibold text-foreground">No bank connections.</span> Statera
              does not connect to your bank and cannot read your accounts. Everything in Statera is
              data you entered or imported yourself.
            </li>
            <li>
              <span className="font-semibold text-foreground">No advertising or tracking.</span> We
              use no advertising networks, no third-party analytics, and no tracking pixels.
            </li>
          </ul>
        </section>

        <section aria-labelledby="section-files-you-upload">
          <h2 id="section-files-you-upload" className="text-lg font-semibold text-foreground">
            4. Files you upload
          </h2>
          <p data-testid="commitment-statement-files" className="mt-2">
            When you import transactions from a CSV or Excel file, the file is processed in memory
            and immediately discarded. Uploaded files are never stored — not on our servers and not
            in our backups. Only the individual transaction rows you confirm during import are saved
            to your account.
          </p>
        </section>

        <section aria-labelledby="section-service-providers">
          <h2 id="section-service-providers" className="text-lg font-semibold text-foreground">
            5. Service providers
          </h2>
          <p className="mt-2">
            Statera runs on a small, fixed set of infrastructure providers. Each processes data only
            as needed to provide its function:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-foreground">Hetzner</span> (Finland) — hosts our
              server and database.
            </li>
            <li>
              <span className="font-semibold text-foreground">Cloudflare</span> (EU jurisdiction
              storage) — provides our domain and DNS, routes email sent to our contact address, and
              stores our encrypted database backups.
            </li>
            <li>
              <span className="font-semibold text-foreground">Google</span> — provides sign-in (we
              receive your name and email from your Google account; Google does not receive your
              financial data).
            </li>
            <li>
              <span className="font-semibold text-foreground">Postmark</span> — delivers emails we
              send you (such as budget alerts).
            </li>
            <li>
              <span className="font-semibold text-foreground">Sentry</span> — receives error reports
              when something in the app breaks. Our error reporting is configured to scrub personal
              data before sending.
            </li>
          </ul>
          <p className="mt-2">We use no other processors and no third-party analytics.</p>
        </section>

        <section aria-labelledby="section-where-your-data-lives">
          <h2 id="section-where-your-data-lives" className="text-lg font-semibold text-foreground">
            6. Where your data lives
          </h2>
          <p className="mt-2">
            Your data is stored on our server in Helsinki, Finland, and in encrypted backups stored
            with Cloudflare in the EU. All traffic between your browser and Statera is encrypted
            (HTTPS).
          </p>
        </section>

        <section aria-labelledby="section-backups-retention-deletion">
          <h2
            id="section-backups-retention-deletion"
            className="text-lg font-semibold text-foreground"
          >
            7. Backups, retention, and deletion
          </h2>
          <p data-testid="commitment-backup-retention" className="mt-2">
            We keep encrypted database backups for disaster recovery: daily backups for 14 days,
            weekly backups for 56 days, and monthly backups for 365 days. When you delete your
            account, your data is removed from the live database immediately, but copies may persist
            inside these encrypted backups for up to 365 days before they expire. Backups are never
            used for any purpose other than restoring the service after data loss. If we ever restore
            the service from a backup, we re-apply all account deletions completed before the restore,
            so a deleted account is purged again as part of the restore procedure and does not come
            back.
          </p>
          <p className="mt-2">
            A permanent, anonymous deletion record (a one-way hash) is retained after account
            deletion so we can honor the re-deletion commitment above. It cannot be used to
            reconstruct your data.
          </p>
        </section>

        <section aria-labelledby="section-your-rights">
          <h2 id="section-your-rights" className="text-lg font-semibold text-foreground">
            8. Your rights
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-foreground">Export.</span> You can download a
              complete copy of your data at any time from your profile (Data &amp; privacy → download
              my data). The export includes everything listed in §2, in a machine-readable format.
            </li>
            <li>
              <span className="font-semibold text-foreground">Deletion.</span> You can delete your
              account and all its data at any time from your profile. Deletion requires re-confirming
              your identity and is immediate and irreversible in the live system (see §7 for
              backups).
            </li>
            <li>
              <span className="font-semibold text-foreground">Questions and requests.</span> For
              anything you cannot do in the app, email privacy@staterafinance.app. We respond to
              privacy requests typically within 30 days.
            </li>
          </ul>
        </section>

        <section aria-labelledby="section-cookies-and-sessions">
          <h2 id="section-cookies-and-sessions" className="text-lg font-semibold text-foreground">
            9. Cookies and sessions
          </h2>
          <p className="mt-2">
            Statera uses only the cookies required to operate: a session cookie that keeps you
            signed in, and short-lived cookies used during sign-in and account deletion. There are
            no advertising or analytics cookies. Session cookies expire after 30 days; you can end
            all sessions at any time from your security settings.
          </p>
        </section>

        <section aria-labelledby="section-changes">
          <h2 id="section-changes" className="text-lg font-semibold text-foreground">
            10. Changes to this policy
          </h2>
          <p className="mt-2">
            If this policy changes, we will update the &ldquo;Last updated&rdquo; date above.
            Material changes will be announced in the app before they take effect.
          </p>
        </section>

        <section aria-labelledby="section-contact">
          <h2 id="section-contact" className="text-lg font-semibold text-foreground">
            11. Contact
          </h2>
          <p className="mt-2">
            privacy@staterafinance.app — operated by Khaled AlRashidi, State of Kuwait.
          </p>
        </section>
      </div>
    </LegalPageLayout>
  )
}

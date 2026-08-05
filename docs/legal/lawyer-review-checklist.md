# Lawyer review checklist — legal pages (pre-announcement gate)

The final Privacy Policy (`/privacy`) and Terms of Service (`/terms`) copy
shipped in the `phase-4: 10c-content` commit (effective date 6 July 2026).
The text is operator-approved and live, but it has **not** been reviewed by a
Kuwait-qualified lawyer.

**This is a pre-ANNOUNCEMENT gate, not a pre-launch gate.** The text ships now;
the items below must be reviewed by a Kuwait-qualified lawyer before Statera is
publicly announced.

**Update (2026-08-05, operator decision recorded via review channel — TB-F7):**
the operator has elected to announce WITHOUT external lawyer review. That call is
recorded, not contested. This checklist therefore also serves as the **self-audit
record**: each item is the engineering/factual basis a reviewer would have checked,
verified against the running system. With no external reviewer, the scrubbing item
below is the only standing record of the bare-unkeyed-name limitation.

## Items requiring legal review

- [ ] **Privacy §1 — consent framing.** Verify the Electronic Transactions Law
      No. 20 of 2014 consent basis is stated correctly, and whether an explicit
      consent-capture step at signup is required or advisable.
- [ ] **Privacy §7 — re-deletion-on-restore commitment.** Verify the
      enforceability and adequacy of the wording committing us to re-apply
      account deletions after any backup restore.
- [ ] **Terms §3 — age threshold.** Verify that the 18-year-old minimum is
      correct and sufficient under Kuwaiti law.
- [ ] **Terms §7 — limitation of liability.** Verify the liability-limitation
      clause is enforceable under Kuwaiti law.
- [ ] **Terms §9 — governing law and jurisdiction.** Verify the governing-law
      and courts-of-Kuwait jurisdiction clause.
- [ ] **Global — factual accuracy.** Verify the five-provider list (Hetzner,
      Cloudflare, Google, Postmark, Sentry) and every factual claim against the
      running system, not against this document or the page text.
- [ ] **Privacy §5 — Sentry scrubbing claim (FIND-TB1).** The policy states our
      error reporting "is configured to scrub personal data before sending." As of
      Task B / B2 the backend scrubber (`lib/sentry.ts` `scrubEventText` +
      `sentryBeforeSend`) redacts emails, IBANs, `enc1:` ciphertext, PII
      `key=value`, KWD amounts, and finance `key=value` across request / extra /
      breadcrumbs / **message** / **exception values** — the message + exception
      surfaces were UNSCRUBBED before B2, which is what had made the claim broader
      than the hook delivered. **Documented limitation:** a bare, UNKEYED name in
      free prose (e.g. a merchant name written into an error message with no
      `merchant=` key) is not regex-redacted; the frontend reporter's tight
      allowlist payload (no props, no query string, no amounts sent) is the primary
      protection there. Verify the claim is accurate and adequate as published, and
      whether the policy wording should be tightened (deferred — operator+lawyer
      call, per TB-R3). (This line was proposed in the T1-4 close-out and never
      landed until Task B / B2 — FIND-TB1.)

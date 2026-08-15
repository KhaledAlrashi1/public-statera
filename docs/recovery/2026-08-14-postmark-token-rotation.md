# 2026-08-14 — Postmark token rotation, and the from-address discard

**Class:** unplanned operational work touching production secrets. Recorded per the
"Operational work conventions" standing rule: the fix-forward in `CLAUDE.md` is the durable
lesson record, this file is the operational continuity document.

**Scope (10e-R49 as narrowed by 10e-R57):** this covers the whole ops episode, not the token
alone — the rotation AND the `MAIL_FROM_ADDRESS` state alongside it, each with its own dated
line, and why they were separate commits.

---

## What happened, one dated line per event

**2026-08-14 — `POSTMARK_API_KEY` rotated. Committed `e64a28e`.**
During Postmark onboarding for Module 10e (magic-link), a server token was captured in a
screenshot. It was rotated the same day: a new token issued in Postmark, the old one revoked,
`secrets/.env.prod.sops.yaml` re-encrypted and committed.

The scope of that commit was established **from the diff, not from recollection** (10e-R57):

```
$ git show --numstat e64a28e -- secrets/.env.prod.sops.yaml
3	3	secrets/.env.prod.sops.yaml

$ git show --no-textconv -U0 e64a28e -- secrets/.env.prod.sops.yaml \
    | grep -oE '^[+-][A-Za-z0-9_]+:' | sort -u
+POSTMARK_API_KEY:
-POSTMARK_API_KEY:
```

`MAIL_FROM_ADDRESS` does **not** appear. Three changed lines = the one variable plus the two
indented sops metadata lines (`lastmodified`, `mac`) that any re-encrypt necessarily re-stamps.
No decryption was performed to establish this; no textconv driver is configured
(`git config --get diff.sopsdiffer.textconv` → exit 1), so `git diff` operated on ciphertext.

**2026-08-14 — an uncommitted `MAIL_FROM_ADDRESS` edit was DISCARDED. Unrecoverable (10e-R56).**
A separate working-tree edit to `MAIL_FROM_ADDRESS` existed on top of `e64a28e` and was discarded
during the same episode. It was never committed and never stashed, so it cannot be recovered.

The premise that makes this a real loss rather than a harmless no-op re-save is **verified, by an
artifact that still exists**. `e64a28e` is a commit known to have changed exactly one variable,
and it produced a 3-line diff in a 35-variable file:

```
$ git show --no-textconv HEAD:secrets/.env.prod.sops.yaml | grep -cE '^[A-Za-z0-9_]+:'
36        # 36 column-0 keys − the `sops:` metadata block = 35 variables
```

Had sops re-encrypted unchanged values, all 35 value lines would have moved. They did not.
**This sops version preserves unchanged ciphertext**, so a changed value line implies a changed
plaintext — and the discarded edit was therefore a genuine change, not a re-save. (10e-R56
recorded this premise as unverifiable because "the artifact that would settle it is gone"; a
second artifact of the same class survived and settles it. The loss itself remains open.)

**Verified current state.** `MAIL_FROM_ADDRESS` at HEAD is `noreply@staterafinance.app`, the
10e-R43-ratified value. **Evidence class: direct operator read, 2026-08-14 — not commit
archaeology**, which cannot see it. No from-address change is asserted in any commit, because
none was matched in a diff.

## Why these were separate commits

The rotation was a completed, verified change and was committed on its own. The from-address edit
was in-flight and unverified when the episode ended, so it never became a commit. Per **10e-R48**
the accepted `e64a28e` was **not** amended to absorb it: it had already been reconciled and
accepted at 10e-R45/R46/R47, and rewriting an accepted artifact destroys the reconciliation
record. That the commit was unpushed does not make it available for rewriting.

## Deploy lag — accepted, not a defect

`deploy.sh` decrypts secrets from the **deployed commit**, so production continued using the
revoked token until the 10e deploy. Accepted rather than triggering a deploy for a secrets-only
commit:

- the only sender in production is budget alerts, for a single user;
- `sendEmail` fails **soft** — it returns `false`, is Sentry-captured, and never throws
  (`apps/api/src/lib/email.ts:87-91`), so a dead token degrades a notification rather than
  breaking a request path.

## Durable rules earned here

1. **Screenshot configuration screens, never code samples.** Provider onboarding pages routinely
   inline live credentials into copy-paste samples
   (`curl -H "X-Postmark-Server-Token: <live token>"`). A screenshot of a *settings* pane shows
   state; a screenshot of a *sample* ships a secret. Same class as the 8c `head -3 keys.txt`
   disclosure — an illustrative surface that renders live key material. Prefer the view that
   shows the fact without the value.
2. **A run-sheet step whose PASS condition is silence carries a paired positive control in the
   same block, and any step gating an irreversible action states its two causes before the
   action** (10e-R53/R54). The discard here was conditioned on a step "printing nothing," which
   was itself the ambiguous state — an unsatisfiable condition, and a defect in the condition
   rather than in its execution.
3. **Never read `POSTMARK_API_KEY` out of sops for comparison**, in whole or in part
   (10e-R15(1); 8c precedent). No diagnostic is worth it.

## What was deliberately NOT done

- No deploy triggered for the secrets-only commit (see the deploy-lag section).
- No attempt to recover the discarded edit — it was never committed or stashed.
- `POSTMARK_API_KEY` never read out of sops.
- `e64a28e` never amended (10e-R48).

## Open decisions for the next session

1. **10e-R56's unverifiable-premise caveat** is now dischargeable on the `e64a28e` evidence above.
   The **loss itself stays open** and unrecoverable; only the caveat clause is settled. Amending
   the ruling is the channel's act, not the implementer's.
2. **Confirm the rotated token is live in production** at 10e-close. The 10e-R15 production
   end-to-end send proof exercises exactly this — an entry in Postmark Activity for the
   production server proves the production key and stream — so no separate check is owed.
3. **Postmark account approval** was submitted and pending as of 2026-08-14 (10e-R43). It governs
   who may receive, not whether the domain sends legitimately, and it gates announcement rather
   than 10e-2.

## Suggested opening prompt for the next conversation

> Read `CLAUDE.md` and `docs/modules/phase4-10e.md` in full, then this file. Module 10e is in
> progress: 10e-0, 10e-1, 10e-3a-EXTRACT, 10e-2-EXTRACT and 10e-2 are committed and unpushed.
> Next in order is **10e-3a** (`POST /api/auth/magic-link/verify`), whose design is approved in
> the persisted Phase A — implement from that file, not from conversation context. Before
> starting, confirm HEAD, a clean tree, and the unpushed count, and note that the dev MySQL
> credential is the deliberate placeholder `change-me` (see the CLAUDE.md fix-forward for the
> `dotenv` CWD seam that makes `DATABASE_URL` need passing explicitly to `pnpm --filter … exec`
> commands).

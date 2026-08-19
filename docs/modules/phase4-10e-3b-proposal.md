# 10e-3b — OIDC email adoption in the Google callback

**STATUS: PROPOSED, NOT APPROVED.**

Written under 10e-R145 (five items) and 10e-R146 (form and the hard stop), review-channel block
"10e-R148 … 10e-R152, 2026-08-19". Committed docs-only per 10e-R146(b) because it exceeds
comfortable relay size. No file under `apps/` is written by this commit.

**Citation discipline (10e-R143, 2026-08-19, "citations to unpersisted rulings carry number, date
AND title").** Rulings cited below that resolve to an artifact in this repository are marked
**[persisted]** with their location. Rulings that do not are marked **[number held, date/title not
held]** — I hold the number from CLAUDE.md prose or from this conversation's channel record, and per
10e-R102 I do not reconstruct their text. This applies to R82, R83, R85, R100, R105, R132.

---

## 0. What was measured before anything was designed

Every claim in this section is an observation, not an assertion read out of a document. Where an
enumeration came back inconvenient it is printed anyway (10e-R146(c)).

### 0.1 — R145 item 1: what the callback does with `email_verified` today

**Nothing. The claim is never read anywhere in the API.**

```
$ grep -rn 'email_verified\|emailVerified' apps/api/src/
grep_rc=1        (0 lines)

POSITIVE CONTROL — same invocation, a claim the callback does read:
$ grep -rn '"given_name"' apps/api/src/ | wc -l
1
```

The zero is discriminating: the instrument fires in scope on a claim that *is* read. The complete
set of claims the codebase reads is five lines, all in `routes/auth.ts`:

```
apps/api/src/routes/auth.ts:196:        displayName: (claims["name"] as string | undefined) ?? null,
apps/api/src/routes/auth.ts:197:        firstName: (claims["given_name"] as string | undefined) ?? null,
apps/api/src/routes/auth.ts:198:        lastName: (claims["family_name"] as string | undefined) ?? null,
apps/api/src/routes/auth.ts:232:        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
apps/api/src/routes/auth.ts:265:        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
```

plus `claims.sub` and `claims.email` at `:167-168`. The email is taken raw:

```ts
  const claims = tokenSet.claims()
  const externalId = claims.sub
  const email = claims.email
  if (!email) {
    return c.json(
      { error: "No email in OIDC claims — verify provider scopes include 'email'" },
      400,
    )
  }
```

**There is no validator on this path at all** — no zod, no normalization, no verification check.
`email` flows verbatim into the INSERT at `:195` and both UPDATEs at `:231`/`:264`. This matters for
item 5 and is the single most consequential measurement in this document.

The gate R13(a) requires is typeable: `email_verified?: boolean` at
`apps/api/node_modules/openid-client/types/index.d.ts:268`, and `IdTokenClaims extends
UserinfoResponse` (`:469`), so `claims.email_verified` is `boolean | undefined` and `=== true`
collapses absent and false into one branch without a cast.

### 0.2 — R145 item 2: the unguarded email writes, and there are THREE, not two

**FINDING — 10e-R13(b) [persisted, `docs/modules/phase4-10e.md:1264`] names "one of two identical
crash paths". The enumeration finds three.** The third is the reactivate branch, which R13(b) does
not mention and which writes `email` exactly as unguarded as the branch it does name.

Complete inventory of production writes that can set `users.email` (tests excluded; the block
scanner's positive control found the 3 known non-email `lastLoginAt` updates, so it sees update
blocks it is not looking for):

| # | site | branch | shape | hits `users_email_unique`? |
|---|---|---|---|---|
| 1 | `routes/auth.ts:191` | `!existing` | `INSERT ... values({ ..., email, ... })` | **yes** — F2's original path |
| 2 | `routes/auth.ts:228-237` | `!existing.isActive` (reactivate) | `UPDATE ... set({ isActive: true, email, ... })` | **yes — NOT named by R13(b)** |
| 3 | `routes/auth.ts:262-267` | `else` (existing-active) | `UPDATE ... set({ email, displayName })` | **yes** — the one R13(b) names |
| 4 | `routes/magic-link.ts:582` | 10e-3a sign-up | `INSERT ... values({ ..., email })` | guarded by 10e-3a's exact-match refusal |

Path 2, verbatim:

```ts
    await db
      .update(users)
      .set({
        isActive: true,
        email,
        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
        totpSecret: null,
        totpEnabled: false,
        totpBackupCodesJson: null,
      })
      .where(eq(users.id, userId))
```

`users.email` is `varchar(255).notNull().unique()` (`db/schema/users.ts:18`), which is the
`users_email_unique` constraint the ER_DUP_ENTRY names.

**Why path 2 is genuinely reachable and not a theoretical sibling.** The purge does **not** clear
`users.email` — `purgeUserAccountRows`'s terminal soft-delete sets only
`{ isActive, sessionVersion, totpSecret, totpEnabled, totpBackupCodesJson }`
(`lib/account-deletion.ts:125`), so a soft-deleted row **keeps occupying its address in
`users_email_unique`**. A Google user who deleted their account, whose provider-side email later
changes to an address a magic-link user now holds, hits path 2 on their return login. R13(b)'s own
rationale — that 10e enlarges this because magic-link creates users keyed on arbitrary
user-supplied addresses — applies to path 2 identically.

R13(b) closes: *"Silently fixing one of two identical crash paths is not acceptable."* Fixing two of
three would be the same defect one instance further along. **All three are in scope below.**

### 0.3 — R145 item 4: the coverage gap, established by measurement, and it is wider than carried

10e-R132 [number held, date/title not held] carries the claim that `auth.callback.test.ts` sets
`totpEnabled: false` at both of its only two sites. **Confirmed:**

```
$ grep -n 'totpEnabled' apps/api/src/routes/auth.callback.test.ts
130:      totpEnabled: false,
148:      totpEnabled: false,
```

The enumeration does not contradict the claim. It does **enlarge** it, and the enlargement is the
finding:

```
$ grep -n 'describe(\|it(\|test(' apps/api/src/routes/auth.callback.test.ts
116:describe("GET /callback — reactivate-as-fresh on inactive account (10d-0b)", () => {
117:  it("flips active, refreshes claims, nulls TOTP, and redirects to /welcome?source=signup", async () => {
```

**One `describe`. One `it`.** And it is the only file that exercises the route — four other files
matched a `/callback` grep, but every one of them matched on an `oauthRedirectUri:
"http://localhost:3000/api/auth/callback"` string inside an env mock, not on a request:

```
apps/api/src/routes/account.test.ts:55:    oauthRedirectUri: "http://localhost:3000/api/auth/callback",
apps/api/src/routes/auth.2fa-verify.test.ts:35:    oauthRedirectUri: ...
apps/api/src/routes/auth.2fa.test.ts:43:    oauthRedirectUri: ...
apps/api/src/routes/auth.sessions.test.ts:41:    oauthRedirectUri: ...
```

(The positive control — the same form against the well-covered `/2fa/verify` — returns three files
that genuinely drive it, so the instrument distinguishes "exercises" from "mentions" only by
reading the matched lines, which is why they are printed.)

So the gap is not "the TOTP branch is untested." It is: **`GET /callback` has exactly one
route-level test, covering the reactivate branch only. The `!existing` INSERT branch (F2's crash
path) and the existing-active branch (R13(b)'s crash path) have no route-level coverage either.**
10e-3b modifies all three, and closes the gap for all three.

Noted as the asymmetry the channel is trading on: 10e-3a's hermetic case 10 already gives the
magic-link TOTP handoff the route-level coverage the OIDC handoff has never had.

### 0.4 — R145 item 5: the channel's question, answered — one premise falsified, the conclusion strengthened

The channel asked whether R122's arrow runs back: does 10e-3b's adopt need R122(b)'s exact-match
gate? It asked for two things established first.

**Premise (i) — "what comparison the OIDC adopt lookup actually performs, pasted from source."
FALSIFIED, and this is a finding, not a formality: there is no such lookup.** The callback's only
lookup is on the composite identity, never on email:

```ts
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.externalId, externalId)))
    .limit(1)
```

`apps/api/src/routes/auth.ts:179-183`. The email lookup does not exist today — **it is precisely
what 10e-3b introduces.** So its comparison semantics are a design choice I am making, not a fact I
can measure off the tree. I cannot paste what was asked for, and reporting that is the honest form
rather than pasting the composite lookup as though it answered the question.

**Premise (ii) — accent-insensitivity in this schema. HOLDS, measured, with the `_as_cs` control.**

Column: `email` / `utf8mb4` / `utf8mb4_0900_ai_ci` (from `information_schema.COLUMNS`, live dev DB).

Literal probes (connection charset `utf8mb4`; the first attempt returned
`ERROR 1253 ... not valid for CHARACTER SET 'latin1'` because the client charset defaulted to
latin1 — recorded because the error is what revealed the probe was not yet measuring the intended
collation):

| probe | result | reads as |
|---|---|---|
| B: `'jose@x.com' = 'josé@x.com'` under `ai_ci` | **1** | accent-insensitive |
| C: **DISCRIMINATING CONTROL** — same pair under `_as_cs` | **0** | the 1 is the collation's, not a comparison that always succeeds |
| D: `'khaled@gmail.com' = 'Khaled@Gmail.com'` under `ai_ci` | **1** | case-insensitivity intact (R82/R83's load-bearing behaviour) |
| E: **CONTROL** — `'jose@x.com' = 'maria@x.com'` | **0** | distinct addresses do not match |

Literals are the weaker instrument, so the same question was put to the real column inside a
rolled-back transaction:

| probe | result |
|---|---|
| F: `WHERE email = 'josé@…'` finds the **stored** ASCII row | **1** |
| G: **DISCRIMINATING CONTROL** — same `WHERE` under `_as_cs` | **0** |
| H: **CONTROL** — `WHERE email = 'jose@…'` finds it (proves the row landed) | **1** |
| I: post-rollback residue | **0** |

And the unique-index half, with a tripwire:

```sql
INSERT ... VALUES ('jose@probe2-10e3b.test', ...);
INSERT ... VALUES ('josé@probe2-10e3b.test', ...);
SELECT 'TRIPWIRE REACHED = premise FALSIFIED (accent variants CAN coexist)';
```

→ `ERROR 1062 (23000): Duplicate entry 'josé@probe2-10e3b.test' for key 'users.users_email_unique'`.
**The tripwire did not print**, which is what makes its absence discriminating. Verified clean from
a separate connection: `probe_rows_remaining=0`.

**Answer: R122(b)'s exact-adoption rule APPLIES here, and it is MORE load-bearing on this side than
on the side it was ruled for.**

The channel's hypothesised sequence holds exactly. A provider asserts `email_verified: true` for
`josé@x.com`; the adopt lookup runs `eq(users.email, 'josé@x.com')`; under `ai_ci` that matches a
stored `jose@x.com` held by a different person, plausibly a magic-link user; R13(a) is *satisfied*,
because the claim is genuinely verified; and adoption binds the Google identity to the victim's
account. R13(a) and R122(b) are different guards and the first does not imply the second, exactly as
the channel framed it.

**The asymmetry that makes it worse here.** On the magic-link side, R82 [number held, date/title not
held] records that zod's `.email()` rejects a non-ASCII local part first, so R122's exposure is
defence in depth resting on a validator that does not know it is load-bearing. **On this path there
is no validator at all** (§0.1). The address arrives from the provider's claims and reaches the
comparison unfiltered. The one structural mitigation R122 relied on to call its own exposure
unreachable is absent here — so this is reachable, not defence in depth, the moment a provider
issues a non-ASCII local part. The codebase is provider-agnostic by architectural decision and
R13(a) itself says *"the day a second provider is added is the day this becomes load-bearing"*;
that sentence was written about the verification gate and turns out to apply verbatim to the
match gate beside it.

**What must NOT be done, and the reason is R122's own.** The lookup stays `ai_ci`. Making it exact
would miss a stored `Khaled@Gmail.com` for a claimed `khaled@gmail.com` and fall through to INSERT
— manufacturing the F2 crash the adoption exists to prevent. Case-insensitivity is load-bearing and
stays; accent-insensitivity is the whole exposure. **The lookup stays collation-dependent; the
adoption decision becomes exact.** Those are different things and the code will say so.

---

## 1. The design

### 1.1 — Shape: adoption converts a not-found into a found, then the existing branches run unchanged

The one structural decision worth arguing. Adoption could be written as a fourth branch, but an
adopted row may be active or soft-deleted and may carry TOTP, so a fourth branch would duplicate
the reactivate and TOTP logic — and duplicated auth logic is what 10e-R9 and 10e-R63 [both
persisted] exist to prevent. Instead:

```ts
  let existing = <lookup by (authProvider, externalId)>            // unchanged, :179-183

  if (!existing) {
    const [byEmail] = await db.select({...}).from(users)
      .where(eq(users.email, email))                                // ai_ci BY DESIGN — see comment
      .limit(1)

    if (byEmail) {
      // ── GATE 1 (10e-R13(a)) — verified claim required before binding ──
      if (claims.email_verified !== true) { return <fail closed> }

      // ── GATE 2 (10e-R122(b) mirror) — the ai_ci match must be exact beyond case ──
      if (normalizeEmail(byEmail.email) !== normalizeEmail(email)) { return <fail closed> }

      // ── GATE 3 (defensive) — adoption is not reachable on a delete-reauth flow ──
      if (stateDeleteIntent) { return <fail closed> }

      await db.update(users)
        .set({ authProvider: provider, externalId })
        .where(eq(users.id, byEmail.id))

      existing = { ...byEmail, authProvider: provider, externalId }
    }
  }

  if (!existing)                { /* INSERT — unchanged */ }
  else if (!existing.isActive)  { /* reactivate-as-fresh — unchanged */ }
  else                          { /* active: refresh, anti-substitution, TOTP gate — unchanged */ }
```

What this buys, and each is a property I am claiming and will pin:

- An adopted **soft-deleted** row flows into reactivate-as-fresh, which is the correct 10d-0b
  semantics for a returning deleted user, with zero new code.
- An adopted row **with TOTP enabled** flows into the existing TOTP gate, so adoption cannot become
  a 2FA bypass. This is the property that makes §0.3's coverage gap load-bearing rather than
  cosmetic: the gate exists, and nothing has ever driven it.
- `sessionVersion` is read as-is from the adopted row and never re-bumped — the F-3a-3 reasoning
  ported: a re-bump would issue a token the `sv_revoked` key does not cover.

**Gate 3's reasoning, since a defensive guard with no reachable trigger deserves one.** A
delete-reauth flow requires a live session, so `(provider, external_id)` resolves and `existing` is
found — adoption is unreachable there. The guard costs one line and fails closed if that reasoning
is ever wrong. I would rather ship an unreachable guard than an argument.

### 1.2 — TOCTOU on the insert path, which the adoption does not remove

Between the `byEmail` lookup returning nothing and the INSERT, a concurrent request can claim the
address, and the INSERT then raises ER_DUP_ENTRY → 500. Adoption narrows the window; it does not
close it. Proposed: wrap the INSERT and translate a duplicate-key error into the same fail-closed
response as the gates, rather than a 500. This is the difference between a crash and a refusal, and
`ER_DUP_ENTRY` is identifiable (`err.code === "ER_DUP_ENTRY"`, MySQL 1062 — the code observed in
§0.4's tripwire probe).

### 1.3 — R13(b): all three unguarded email writes

The identity is already established by `(provider, external_id)` on paths 2 and 3, so the email
refresh is **cosmetic**. Failing a login because a cosmetic refresh collides would be a worse
outcome than the stale value. Proposed for both UPDATE paths:

- Pre-check whether the incoming `email` is held by a **different** user id. If it is, **omit
  `email` from the `set()`** — the user logs in normally against their existing row with a stale
  address — and emit an audit event recording the skip.
- Path 1 (INSERT) is covered by §1.1's adoption plus §1.2's duplicate-key translation.

This is the least-harm disposition and it is uniform across paths 2 and 3, which is what R13(b)
demands. The stale-address consequence is recorded, not fixed: it is the same root as the queued
10e-R72/R85 [number held, date/title not held] item — same user, same collation, post-announcement,
its own cycle. **Cite R85, do not bundle** (R122(d) [persisted]).

### 1.4 — Response shape on a fail-closed refusal: DECISION REQUESTED

The callback is a browser redirect flow, and its existing error form is a bare
`c.json({ error }, 400)` — a JSON blob rendered in the address bar with no recovery affordance.
10e-R14 [persisted, `phase4-10e.md:1268`] ruled for the magic-link surface that *"a dead end with no
recovery affordance is the actual failure."* The same reasoning applies here, but the fix is a
redirect to a frontend route with copy, and copy is 10e-4 scope, which R146 forbids bundling.

Two options, and I recommend (B):

- **(A)** Follow the existing pattern — `c.json({ error, code }, 400)`. Consistent, ships nothing
  new, and leaves a dead end.
- **(B)** `c.redirect(`${frontendOrigin}/login?error=oidc_adopt_refused`)`. The backend decision is
  the redirect target and the param; the copy rides 10e-4. `/login` already renders a param-driven
  message (`?deleted=1`, 10c-3), so the mechanism exists and the interim behaviour is a plain login
  page rather than a JSON blob.

Both fail closed identically; only the user's experience of the refusal differs. **Ruling
requested.**

### 1.5 — Audit vocabulary: RULING REQUESTED, and R11 is BLOCKING

10e-R11 [persisted, `phase4-10e.md:1330`] makes the exact strings a permanent part of the audit
record and rules **no email address in any event payload**. Proposed, following the `login.*` /
`account.*` families already in use:

| event | when |
|---|---|
| `login.oidc.adopted` | gates passed, identity bound to an existing row |
| `login.oidc.adopt_refused` | any of the three gates refused, with a **closed reason set**: `email_unverified`, `inexact_email_match`, `delete_reauth_context`, `duplicate_email_race` |
| `login.oidc.email_refresh_skipped` | §1.3 collision; login proceeded, address not refreshed |

`inexact_email_match` is reused verbatim from 10e-3a's closed five-literal set, because it is the
same condition — reusing it keeps one vocabulary for one failure across two endpoints.

**BLOCKING guard**, ported from 10e-3a: a whole-payload `JSON.stringify` scan over every captured
`security_events` insert across all branches, asserting the address appears in none. Key-absence is
not sufficient — it is satisfied by an address stored under a differently-named key.

---

## 2. Guards, and how each is proven able to fail

Per 10e-R146(e), every guard ships with its falsification in **both** directions, and every
failure-injection assertion names the **specific** expected error rather than merely that something
failed (the 10d-0 bare-`catch{}` rule).

| guard | forced red | forced red the other way | asserts specifically |
|---|---|---|---|
| Gate 1 (`email_verified`) | delete the check → the unverified-claim test adopts, red | force `!== true` always → the happy-path adopt test refuses, red | the refusal envelope + `email_unverified` reason literal |
| Gate 2 (exact match) | replace with `if (false)` → the accent test adopts, red | replace with a byte-exact `===` on raw emails → the **case-variant** test refuses, red | `inexact_email_match`; the case-variant red is what proves case-insensitivity stayed load-bearing |
| §1.3 refresh skip | remove the pre-check → the collision test raises `ER_DUP_ENTRY`, red | force the skip unconditionally → the ordinary refresh test finds a stale address, red | the exact MySQL error, not "some failure" |
| R11 payload scan | plant the address into an audit `details` | — | the scan names the offending event and key path |

The Gate 2 pair is the one that matters most, and the asymmetry is deliberate: a single-direction
test would pass under a byte-exact comparison, which is the *wrong* fix and the one R122 explicitly
forbids. Only the case-variant red distinguishes the correct guard from the over-tight one.

---

## 3. Test plan, counts, and gate idioms

**Row-vs-test (10e-R126 [persisted, 2026-08-15, "test-count arithmetic, and the updated
manifest"]):** every case below is a distinct `it` block. No `it.each`, no loop-generated cases, so
**rows equal tests** — 12 hermetic rows = 12 hermetic tests, 3 INTEGRATION rows = 3 INTEGRATION
tests. Stated explicitly because a count the reader must reconcile against rows is the defect that
ruling names.

**Hermetic** — appended to `routes/auth.callback.test.ts` (the file exists; per 10e-R137a I will
verify before writing, and this is an append, not a create):

| # | case |
|---|---|
| 1 | adopt happy path — exact email match, `email_verified: true` → binds, session issued, redirect `/` |
| 2 | refuse — `email_verified` **absent** |
| 3 | refuse — `email_verified: false` |
| 4 | refuse — accent-inexact match (`josé` claim vs stored `jose`) |
| 5 | **adopt** — case-variant (`khaled@gmail.com` claim vs stored `Khaled@Gmail.com`) — case stays load-bearing |
| 6 | no email row → INSERT unchanged (regression: adoption did not break new-user signup) |
| 7 | adopted row with `totpEnabled: true` → pending-2FA cookie + `/auth/2fa-verify` redirect |
| 8 | **R132 gap closure** — plain existing-active user with `totpEnabled: true` → same, on the pre-existing path |
| 9 | R13(b) path 3 — active-branch email collision → login succeeds, address unchanged, skip audited |
| 10 | R13(b) path 2 — reactivate-branch email collision → reactivation succeeds, address unchanged |
| 11 | **BLOCKING R11** — whole-payload scan, no address in any `security_events` insert, all branches |
| 12 | gate 3 — adoption refused in a delete-reauth context |

Cases 7 and 8 are what close §0.3. Case 8 is the direct discharge of the carried R132 gap and is
worth its own row precisely because it tests a path 10e-3b does not change — a regression pin on
untested pre-existing behaviour that this module is about to route new traffic through.

**INTEGRATION** — new dedicated file `routes/auth.callback.integration.test.ts` (10e-R146(f)):

| # | case |
|---|---|
| I1 | adopt binds against real MySQL; `uq_users_provider_external_id` holds afterwards |
| I2 | §1.2 duplicate-key race → clean refusal, asserting `ER_DUP_ENTRY` specifically, not a 500 |
| I3 | R13(b) collision against the real `users_email_unique` → login succeeds, address unchanged |

**Gate idiom and which column each lands in (10e-R144(c), 2026-08-19).** The INTEGRATION file uses
`describe.skipIf(!INTEGRATION)` — runs **only** under INTEGRATION, therefore skipped hermetically,
therefore **+3 in the hermetic skipped column**. No hermetic-only `describe.skipIf(INTEGRATION)` is
added, so the INTEGRATION skipped column does not move.

**Predicted deltas — DELTAS are the claim; every absolute is re-derived at execution (10e-R150's
sibling rule, derive-don't-carry).**

| | delta | absolute *if* the recorded baseline still holds |
|---|---|---|
| hermetic passed | **+12** | 856 → 868 |
| hermetic skipped | **+3** | 31 → 34 |
| files | **+1** | 60 → 61 |
| INTEGRATION passed | **+15** | 877 → 892 |
| INTEGRATION skipped | **+0** | 10 → 10 |

Cross-check on the predicted figures: 868 + 34 − 10 = 892. ✓

Baselines to re-derive at execution rather than carry (10e-R146(g)): hermetic 856 / 31 / 60 files
exit 0; INTEGRATION 877 / 10 / 0 exit 0; `tsc` 0 both packages; frontend 185 / 39 carried unverified
by design and untouched by this sub-step. Per 10e-R137b a delta that misses its prediction is
investigated before it is absorbed, including the skipped and file columns.

**INTEGRATION obligation: OWED.** This sub-step adds integration cases, which triggers the cadence
rule independently of whether a `db.transaction()` boundary is touched (it is not — adoption is a
single UPDATE, and §1.2's translation does not need one).

**Errors check.** The 10e-R133 [number held, date/title not held] pattern, with the 10e-R135
[persisted, `CLAUDE.md:436`] caveat stated rather than glossed: the counts are demonstrated
non-discriminating and the grep is demonstrated capable of firing, but its independence from the
exit code is undemonstrated and is a bounded unknown owed to 10e-close. **Not "two independent
instruments"** (10e-R134 [number held, date/title not held]).

---

## 4. Scope

**In:** the five R145 items — `email_verified` reporting and gate; all three R13(b) email-write
paths; the lookup-then-adopt; the R132 coverage-gap closure; and item 5's measurement, answered
above with one premise falsified.

**Out, not bundled:** 10e-R129 cross-family token presentation [number held, date/title not held] —
a hypothesis, unmeasured, its own cycle post-10e. 10e-4 frontend. The operator-drafted privacy copy
(10e-R12 [persisted]). Anything belonging to 10e-close. The 10e-R72/R85 stale-address and
accent-lockout consequences — recorded in §1.3, cited, not fixed.

**No external resource is introduced, so no `deploy/Caddyfile` CSP change rides this commit**
(10e-R146(f)).

---

## 5. Open decisions requiring a ruling before implementation

1. **§1.4** — refusal response shape: (A) existing bare JSON, or (B) redirect to
   `/login?error=oidc_adopt_refused`. I recommend (B).
2. **§1.5** — the three audit event strings and the four-literal closed reason set, which R11 makes
   permanent.
3. **§0.2** — confirmation that the third crash path is in scope. R13(b) authorises "handle it or
   scope it out with reasoning" for the path it named; the path it did not name is, strictly, a new
   finding rather than a ruled item, and I do not want to widen my own scope by assertion.

---

## Appendix — findings this proposal raises, listed so none is buried

- **F-3b-1** — R13(b) says two crash paths; there are **three**. The reactivate branch
  (`auth.ts:228-237`) writes `email` as unguarded as the branch R13(b) names. §0.2.
- **F-3b-2** — the purge does **not** clear `users.email`, so soft-deleted rows keep occupying the
  unique index. This is what makes F-3b-1 reachable rather than theoretical. §0.2.
- **F-3b-3** — R145 item 5's premise (i) is **falsified**: there is no OIDC adopt lookup to measure;
  it is what this sub-step creates. §0.4.
- **F-3b-4** — the channel's hypothesis is **confirmed and strengthened**: R122's exposure is
  *more* load-bearing here, because the R82 zod mitigation that made it defence-in-depth on the
  magic-link side **does not exist on this path at all**. §0.1, §0.4.
- **F-3b-5** — `GET /callback` has **one** route-level test total, not merely an untested TOTP
  branch. Two of the three branches 10e-3b modifies have no coverage whatsoever. §0.3.

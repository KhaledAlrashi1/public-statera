# Phase 4 / Module 10e-4 — frontend magic-link surface

**STATUS: APPROVED AND EXECUTED (2026-08-21).** Approved by 10e-R187, amended by 10e-R189 …
10e-R195. The body below is the proposal **as submitted** and is left unedited; everything that
changed between proposal and implementation is recorded in **§12 — EXECUTION AMENDMENTS** at the
end, never by rewriting the text above it.

Authority: 10e-R175 … 10e-R180 (2026-08-21), as amended by 10e-R181 … 10e-R187 (2026-08-21).
Both ruling blocks are persisted verbatim in `docs/modules/phase4-10e.md` by the same commit
that creates this file.

Scope read from the persisted A8 lineage (`phase4-10e.md:895`), not from the prompt:

> **10e-4** — Frontend: LoginPage email path, `/auth/magic` landing page + route, `authApi`
> methods, `AuthContext` wiring, contract fixture regeneration. — `db.transaction()` boundary
> **no** · adds/edits INTEGRATION cases **no** · cadence obligation **none**.

---

## §0 — Citation map

Per 10e-R143 (persisted, `phase4-10e.md:1488`) every citation carries number, date and title,
or says the number is held without them. Built from both header formats after the 10e-R183
finding, not from prose.

| ruling | status | location |
|---|---|---|
| 10e-R12, R14, R15, R16, R17 | **persisted** | `phase4-10e.md:1252/1268/1278/1290/1298`, Format B (`^## 10e-R<n> — `) |
| 10e-R122, R124, R126 | **persisted** | `phase4-10e-3a-proposal.md:1443/1495/1526`, Format A |
| 10e-R142, R143, R148, R149, R150, R151, R161, R162, R167, R168, R171, R172 | **persisted** | `phase4-10e.md`, Format A, within the contiguous 140…173 range |
| 10e-R9, R63, R128 | number held, date/title not held from an artifact in this repository | — |
| 10e-R37, R61, R78, R82, R83, R100, R102, R112, R118, R129, R133, R134, R135, R136, R137b, R144(c), R72, R85 | number held, date/title not held | — |
| B4-2-R6, B4-2-R3, TB-R13, FIND-S5(b), FIND-B4-3 | Task B lineage | `docs/modules/phase4-task-b.md`, CLAUDE.md |

Nothing below reconstructs an unpersisted ruling from CLAUDE.md prose (10e-R102).

---

## §1 — Measurements

Every claim about current behaviour carries pasted source and a matched-line list, including
the ones that came back inconvenient.

### 1.1 (R176 item 1) — the landing route's server-side contract

Source: `apps/api/src/routes/magic-link.ts` at HEAD `c6103c5`, 677 lines.

**Verify success (no TOTP)** — `:675`:

```ts
    // user_id deliberately NOT echoed (10e-R124): the frontend has /me, and the smallest
    // surface that satisfies 10e-4 is the right one. is_new_user is kept because 10e-4
    // routes on it to /welcome?source=signup, matching the OIDC callback's target.
    return c.json({ ok: true, data: { is_new_user: isNewUser }, error: null, meta: {} }, 200)
```

**Verify TOTP handoff** — `:648-653`:

```ts
    if (resolved.totpEnabled) {
      const pendingToken = await packPending2faToken(userId)
      setPending2faCookie(c, pendingToken)
      auditSecurityEvent(db, "login.pending_2fa", { userId, ipAddress, userAgent })
      return c.json({ ok: true, data: { pending_2fa: true }, error: null, meta: {} }, 200)
    }
```

**Verify failure** — `:388-393` and `:441`:

```ts
const MAGIC_LINK_INVALID_BODY = {
  ok: false as const,
  data: null,
  error: "This sign-in link is no longer valid.",
  code: "MAGIC_LINK_INVALID",
}
…
  return c.json(MAGIC_LINK_INVALID_BODY, 400)
```

Status is **400, not 410**, deliberately (`:382-386`): *"410 Gone was rejected deliberately: it
asserts the resource once existed, which is itself the distinguishing signal uniformity
suppresses."*

**FINDING M-1 — both success shapes are `200` with `ok: true`, and they are discriminated only
by which key is present in `data`.** This is the single most consequential fact for 10e-4. A
naive consumer writing `if (data.is_new_user)` against the handoff response reads `undefined`,
falls through as falsy, and routes the user into the app **with no session** — where
`ProtectedRoute` bounces them to `/login` and the pending-2FA cookie expires unused after 300 s.
The discrimination must be explicit and `pending_2fa` must be tested first. §2.2 and §4 build on
this.

**The exact link mailed** — `:275-285`:

```ts
    const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"
    // The token and NOTHING else. An `email` parameter here would hand the address to
    // the Referer header and browser history alongside the credential.
    // TODO(module-10e-4-token-in-url): the landing page should history.replaceState
    // the token out of the URL immediately after reading it.
    const link = `${frontendOrigin}/auth/magic?token=${encodeURIComponent(rawToken)}`
```

`env.corsOrigins` is an array (`apps/api/src/lib/env.ts:73-75`):

```ts
  corsOrigins: optional("CORS_ORIGINS", "http://127.0.0.1:3002")
    .split(",")
    .map((s) => s.trim()),
```

So the path is `/auth/magic`, the query parameter is `token`, and the value is URL-encoded
base64url (43 chars, `MAGIC_LINK_TTL_SECONDS = 900`, `magic-link-lib.ts:45`).

**`magic-link.ts:278` is an instruction addressed to this sub-commit by name.** §2.4 discharges it.

**Request endpoint envelopes**, for the form's error handling:

| outcome | body | status |
|---|---|---|
| success (known **and** unknown address) | `{ ok: true, data: { sent: true }, error: null, meta: {} }` | 200 |
| malformed JSON | `{ …, error: "Invalid JSON.", code: "invalid_json" }` | 400 |
| zod | `{ …, error: <first issue message>, code: "validation_error" }` | 400 |
| send failure | `{ …, error: "We could not send the sign-in link. Please try again.", code: "MAGIC_LINK_SEND_FAILED" }` | 502 |
| throttled | `{ …, code: "rate_limit_exceeded", meta: { retry_after } }` | 429 |

zod messages, `:167-174`: `"Email is required."` and `"Enter a valid email address."`.
`zodErrorToEnvelope` emits `issues[0]` only (`route-helpers.ts:26-30`).

### 1.2 (R176 item 2) — LoginPage as it stands

Located by enumeration: `find apps/web/src -iname '*LoginPage*'` → `LoginPage.tsx`, `LoginPage.test.tsx`.

Every `useSearchParams` / `searchParams` read in the file:

```
apps/web/src/components/pages/LoginPage.tsx:1:import { Link, useSearchParams } from "react-router-dom"
apps/web/src/components/pages/LoginPage.tsx:5:  const [searchParams] = useSearchParams()
apps/web/src/components/pages/LoginPage.tsx:6:  const accountDeleted = searchParams.get("deleted") === "1"
```

**Exactly one read**, `searchParams.get("deleted") === "1"`, from 10c-3. The channel's expectation
is CONFIRMED. No finding.

### 1.3 (R176 item 3) — the router table

`apps/web/src/App.tsx:161-203`, every route with its matched line:

| line | path | ProtectedRoute? |
|---|---|---|
| 164 | `/login` | **outside** |
| 165 | `/auth/2fa-verify` | **outside** |
| 168 | `/delete-account/confirm` | **outside** |
| 170 | `/privacy` | **outside** |
| 171 | `/terms` | **outside** |
| 172 | *(`<Route element={<ProtectedRoute />}>` opens)* | — |
| 173 | `/welcome` | **inside** |
| 174 | *(`<Route element={<AppShell />}>` opens)* | inside |
| 175–197 | index, `home`, `activity`, `plan`, `insights`, `transactions`, `expenses`, `income`, `budget`, `profile`, `*` | inside |
| 200 | `*` (top-level) | **outside** |

`ProtectedRoute` (`apps/web/src/components/auth/ProtectedRoute.tsx:16-18`):

```tsx
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
```

**`/auth/magic` must sit OUTSIDE `ProtectedRoute`**, as a sibling of `/auth/2fa-verify` at
`:165`. The reason is not stylistic: a magic-link clicker has **no session at the moment the page
mounts** — the session is what the page's own POST creates. Inside `ProtectedRoute`, `user` is
`null`, the page never renders, the token is never sent, and the link is broken for every user.
Two existing precedents, both deliberate and both commented as such: `/auth/2fa-verify` (`:165`,
same `/auth/` prefix, same no-session-yet situation) and `/delete-account/confirm` (`:166-168`,
whose comment says *"deliberately OUTSIDE ProtectedRoute"*).

### 1.4 (R176 item 4) — the two post-verify destinations

**`/welcome`** exists at `App.tsx:173`, **inside** `ProtectedRoute`. `WorkspaceChoicePage` reads
the param:

```
apps/web/src/components/pages/WorkspaceChoicePage.tsx:17:  const [searchParams] = useSearchParams()
apps/web/src/components/pages/WorkspaceChoicePage.tsx:18:  const fromSignup = searchParams.get("source") === "signup"
```

Because `/welcome` is **inside** `ProtectedRoute`, navigating there requires `AuthContext.user`
to be non-null **at the moment of navigation**. §1.6 establishes that this does not happen by
itself. This is the second consequential fact of the module.

**`/auth/2fa-verify`** exists at `App.tsx:165`, outside `ProtectedRoute`.
`TwoFactorVerifyPage.tsx:23`:

```tsx
  const deleteIntent = searchParams.get("intent") === "delete"
```

**It tolerates arrival with no param**: `searchParams.get("intent")` returns `null`,
`null === "delete"` is `false`, so `deleteIntent` is `false`, and `:30`/`:37` then take the
ordinary login path — `verifyTwoFactor(code, codeType, { deleteIntent: false })`, which *does*
call `refreshUser()` (`AuthContext.tsx:101-103`), followed by `navigate("/")`.

**So the magic-link TOTP handoff needs NO change to `TwoFactorVerifyPage`.** Navigating to a bare
`/auth/2fa-verify` is already correct, and `navigate("/")` is already the right destination —
which is a claim I can make from the server source rather than by assumption:

- a **brand-new** user is inserted with `totpEnabled: false` (`magic-link.ts:590`), so
  `is_new_user === true` and the TOTP branch are mutually exclusive at insert;
- a **reactivated** user has TOTP nulled at `:622` (`totpEnabled: false`) and `resolved.totpEnabled`
  reassigned at `:624`, **before** the gate is read at `:648`.

Therefore the TOTP branch is reachable only for an existing, active, non-reactivated user, for
whom `/` is exactly right and `/welcome?source=signup` would be wrong.

### 1.5 (R176 item 5) — the TOTP handoff's mechanism gap

The OIDC callback is a **server-side 302**: it sets the pending cookie and the browser follows a
`Location` header. Magic-link verify is an **XHR**: `setPending2faCookie(c, pendingToken)` writes
`Set-Cookie` onto a `fetch` response, the SPA stays mounted, and **nothing navigates unless the
SPA navigates itself**.

Mechanism proposed: on `{ pending_2fa: true }`, call `navigate("/auth/2fa-verify", { replace: true })`
— an in-SPA route change, not a document load. The cookie is already committed to the cookie jar
by the time the `fetch` promise resolves, so no ordering hazard exists between the cookie and the
navigation.

**If the navigation is interrupted** — the user closes the tab, the JS throws between the response
and the `navigate`, the device sleeps — the state is: the magic-link token is **consumed**
(irreversibly, `:473-486`), and a `statera_pending_2fa` cookie is live for
**`PENDING_2FA_TTL = 300` seconds** (`apps/api/src/middleware/pending-2fa.ts:65`, `:117`). The user
recovers by navigating to `/auth/2fa-verify` manually within 5 minutes, or — the realistic path —
by requesting a fresh link, since the consumed token cannot be reused. **No data loss, no lockout,
one wasted link.** I propose no mitigation: the alternative is persisting handoff state client-side,
which is more machinery guarding a strictly smaller window than the 300 s the cookie already bounds.

### 1.6 (R176 item 6) — AuthContext

`apps/web/src/contexts/AuthContext.tsx`. Exposed (`:126-129`):

```tsx
    <AuthContext.Provider
      value={{ user, flags, isLoading, refreshUser, verifyTwoFactor, logout, resetAuthState }}
    >
```

**How session state is established after the OIDC path lands** (`:75-87`):

```tsx
  useEffect(() => {
    authApi
      .me()
      .then((data) => {
        setUser(data.user ?? null)
        setFlags(normalizeFlags(data.flags))
      })
      .catch(() => {
        setUser(null)
        setFlags(defaultFlags)
      })
      .finally(() => setIsLoading(false))
  }, [])
```

A **mount-only** effect (`[]`). The OIDC path works because the callback is a full-document
redirect: the SPA boots fresh, the effect runs once, and the cookie is already present — so
`/me` returns the user **by construction**.

`resetAuthState` (`:120-124`) is network-free: `setUser(null)`, default flags, `queryClient.clear()`.

**FINDING M-2 — a `/me` refetch after magic-link verify is REQUIRED, and it does not happen by
construction.** The magic-link clicker's SPA mounted **before** any session existed, so the effect
already ran and already set `user = null`. Nothing re-runs it: it has no dependencies, and a
client-side `navigate()` does not remount the provider. Without an explicit `await refreshUser()`
the user is navigated to `/welcome` or `/` with `user === null`, `ProtectedRoute` fires
`<Navigate to="/login">`, and the user is bounced to the login page **holding a valid session
cookie** — a signed-in user staring at a sign-in page. `refreshUser` (`:69-73`) is exactly the
right instrument and is already exposed; the precedent is `verifyTwoFactor` at `:101-103`, which
awaits it for the same reason.

Note `refreshUser` does **not** catch — it rejects if `/me` fails. §2.2 handles that.

### 1.7 (R176 item 7) — StrictMode

```
apps/web/src/main.tsx:1:import { StrictMode } from "react"
apps/web/src/main.tsx:27:  <StrictMode>
apps/web/src/main.tsx:29:  </StrictMode>
```

Whole-tree grep across `apps/web/src` returns those three lines and no others. **StrictMode is ON**,
wrapping `<App />`.

**Stated precisely rather than overclaimed:** React's StrictMode double-invokes effects **in
development only**; a production `vite build` does not. So the double-consume symptom from *that*
cause is dev-only. Three reasons the guard is still proposed, and the first is sufficient on its own:

1. Dev-only breakage of the module's primary new path is a defect, not an inconvenience — every
   magic link would appear invalid on the machine where the feature is being built and demoed.
2. A production reload of `/auth/magic?token=…` (F5, pull-to-refresh, restore-tabs) remounts the
   page with the token still in the URL and re-fires the effect against an already-consumed token.
   §2.4's URL scrub is what actually closes this one, and the two guards are independent.
3. `App.tsx` does not wrap in StrictMode, so component tests do not double-invoke unless they opt
   in — which means the test in §6 case 10 must **explicitly** render under `<StrictMode>` or it
   asserts nothing.

Guard: a `useRef<boolean>` latch set synchronously before the POST is issued. Proven able to fail
in both directions — §9 G-3.

### 1.8 (R176 item 8) — the token's exposure surface

Measured, not assumed:

**(a) The address bar and history.** The document is fetched at `/auth/magic?token=…`, so the
token is in the current history entry until something removes it. Disposition: discharge the
existing `magic-link.ts:278` TODO —
`window.history.replaceState({}, "", "/auth/magic")` immediately after reading the token,
**before** the POST is issued. `replaceState` rewrites the current entry, so Back does not
resurrect it.

**(b) Referer.** Sub-resource requests issued **before** React runs carry the full URL as
`Referer`. Those are the requests in `index.html`:

```
apps/web/index.html:5:    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
apps/web/index.html:14:    <script type="module" src="/src/main.tsx"></script>
```

`grep -nE 'https?://' apps/web/index.html` → **rc=1, no matches**. Both references are
same-origin, and fonts are self-hosted via `@fontsource` in `main.tsx` (design-5.4e). **So the
Referer exposure is same-origin only.**

**Worth recording explicitly:** the design-5.4e font self-host — done for CSP narrowing and the
visitor-IP leak on the legal pages — is what makes this true. Had the Google Fonts `<link>`
survived, every magic-link click would have sent `Referer: https://staterafinance.app/auth/magic?token=<live credential>` to `fonts.googleapis.com` and `fonts.gstatic.com` before any of our
code ran, and no amount of `replaceState` could have prevented it. A CSP narrowing paid off in a
threat model it was not chosen for. It also means the standing enforcing-CSP rule is now
load-bearing for *credential confidentiality*, not only for resource control.

**(c) Server logs.** `/auth/magic` is served by **Caddy's SPA fallback**
(`deploy/Caddyfile:52-57`), never by Hono — so the token never reaches
`app.use("*", logger())` (`apps/api/src/app.ts:26`), which sees only
`POST /api/auth/magic-link/verify` with the token in the **body**. `grep -n 'log\|access' deploy/Caddyfile`
→ **rc=1**: no `log` directive, so no per-site access log is configured.

**(d) Sentry / the frontend error reporter.** `error-reporter.ts:73-83`:

```ts
function sanitizeRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => (NUMERIC_SEG.test(seg) || UUID_SEG.test(seg) ? ":id" : seg))
    .join("/")
}

function currentRoutePathname(): string {
  try {
    return sanitizeRoute(window.location.pathname)
  } catch {
    return "/"
  }
}
```

`location.pathname` only — `:18-20` records `location.search` as NEVER included. A crash on
`/auth/magic` reports route `/auth/magic` with no token.

**Residuals, stated rather than waved at:** the token is in the **email** (by construction, that
is the delivery channel) and in any mail-provider click-tracking or corporate link-scanner that
dereferences URLs in mail. A scanner that follows the link **consumes** it — the user then sees
the R14 failure copy on a link they never clicked. This is inherent to magic links, not to this
implementation; the mitigation is the recovery affordance R14 already mandates (request another,
right there). 10e-4 does not attempt to solve it, and the 15-minute TTL bounds it.

### 1.9 (R176 item 9) — CSP

Current policy, `deploy/Caddyfile:26`, pasted whole:

```
Content-Security-Policy "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
```

Enumeration of what 10e-4 introduces, which is the part that makes the conclusion mine:

| introduced | directive it needs | already allowed? |
|---|---|---|
| `POST /api/auth/magic-link/request` (same-origin `fetch`) | `connect-src 'self'` | yes |
| `POST /api/auth/magic-link/verify` (same-origin `fetch`) | `connect-src 'self'` | yes |
| `<form onSubmit>` with `preventDefault` — no navigation | `form-action 'self'` (not even triggered) | yes |
| icons on the new page | none — `lucide-react` is bundled, inline SVG | n/a |
| fonts | none — already self-hosted | yes |
| images | none introduced | n/a |

**Conclusion, measured and mine: NO `deploy/Caddyfile` change.** 10e-4 introduces zero external
origins. The A8 prediction is confirmed rather than inherited. If the operator later wants the
landing page to render a provider logo or an external asset, that is a new external origin and
its Caddyfile line rides that commit.

### 1.10 (R176 item 10) — the shared form

**Proposed: ONE component, `MagicLinkRequestForm`, rendered in two places.**

The reason is the duplication criterion this module already settled, not a preference for DRY.
10e-R128 (number held, date/title not held) drew the line as *"a duplication rule is about shared
contracts, not repeated characters"* — and 10e-R177 makes the request-submitted string
**byte-identical for a known and an unknown address, BLOCKING**. That byte-identity is a shared
contract in the precise sense R9/R63 protect: two copies could satisfy it on the day they are
written and drift the first time someone edits one. With one component the property is
**structural** — there is one string, so there cannot be two.

The `no renames` constraint (R178) does not bind: `MagicLinkRequestForm` is a **new** export, and
nothing existing is renamed, moved, or re-exported.

The two mount points are `/login` (a second sign-in path beside "Continue with Google") and
`/auth/magic` (R14's mandated form directly beneath the failure copy).

---

## §2 — Design

### 2.1 Files

| file | status | contents |
|---|---|---|
| `apps/web/src/components/auth/MagicLinkRequestForm.tsx` | **new** | the shared request form |
| `apps/web/src/components/pages/MagicLinkPage.tsx` | **new** | `/auth/magic` landing page |
| `apps/web/src/components/pages/LoginPage.tsx` | edited | renders the form |
| `apps/web/src/App.tsx` | edited | `lazyWithRetry` + one `<Route>` outside `ProtectedRoute` |
| `apps/web/src/lib/api.ts` | edited | two `authApi` methods |
| `apps/web/src/types/api.ts` | edited | the verify result union |
| `apps/web/src/contract/capture.ts` | edited | two `INVOCATIONS` entries |
| `apps/web/contract/frontend-calls.json` | regenerated | 64 → 66 |

No `apps/api` change. No `deploy/Caddyfile` change. No rename of any existing file or export.

### 2.2 `api.ts`

```ts
magicLinkRequest: async (email: string): Promise<void> => {
  await apiFetch<unknown>("/api/auth/magic-link/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
},
```

**Returns `void` deliberately.** The 200 body is the fixed `{ sent: true }` (`magic-link.ts:308`),
identical for a known and an unknown address. Returning nothing means the confirmation UI
**cannot** branch on a distinguishing field, because no field reaches it — R14's uniformity
becomes a property of the call signature rather than of the caller's discipline. Failures arrive
as `ApiError` and carry `code`.

```ts
export type MagicLinkVerifyResult =
  | { kind: "pending_2fa" }
  | { kind: "session"; isNewUser: boolean }

magicLinkVerify: async (token: string): Promise<MagicLinkVerifyResult> => {
  const payload = await apiFetch<unknown>("/api/auth/magic-link/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  })
  const data = readApiData<{ pending_2fa?: unknown; is_new_user?: unknown }>(payload)
  // pending_2fa FIRST (FINDING M-1): both shapes are 200/ok:true and are told apart
  // only by which key is present. Reading is_new_user first would see `undefined` on
  // the handoff response and route a session-less user into the app.
  if (data.pending_2fa === true) return { kind: "pending_2fa" }
  if (typeof data.is_new_user === "boolean") {
    return { kind: "session", isNewUser: data.is_new_user }
  }
  throw new ApiError(
    "Unexpected sign-in response.",
    200,
    "MAGIC_LINK_UNEXPECTED_RESPONSE",
  )
},
```

The final `throw` is not defensive padding — it is the mechanism §4 assigns the weight to.

### 2.3 `MagicLinkRequestForm`

Props: `{ autoFocus?: boolean }`. State: `idle | submitting | sent | error`.

- Submit → `authApi.magicLinkRequest(email.trim())`.
- Success → replace the form with the confirmation string (§3, C-2). **One string, one site.**
- `ApiError.code === "rate_limit_exceeded"` → C-4. This is safe: it reflects the requester's own
  request rate and says nothing about whether the address exists.
- Any other failure → C-5.
- Empty/whitespace input → C-3, client-side, no request issued.

### 2.4 `MagicLinkPage` (`/auth/magic`)

```
mount
 ├─ read ?token
 ├─ token absent  → render <MagicLinkRequestForm autoFocus />          (state: form)
 └─ token present → latch (§9 G-3) → history.replaceState → POST verify (state: verifying)
      ├─ kind "pending_2fa"          → navigate("/auth/2fa-verify", { replace: true })
      ├─ kind "session", isNewUser   → await refreshUser() → navigate("/welcome?source=signup", { replace: true })
      ├─ kind "session", !isNewUser  → await refreshUser() → navigate("/", { replace: true })
      ├─ ApiError code MAGIC_LINK_INVALID → state: invalid   (C-1 + form beneath)
      └─ anything else                    → state: failed    (C-6 + form beneath)
```

`replaceState` runs **before** the POST so an interrupted request still leaves a clean URL.
`{ replace: true }` on every navigation so Back does not return to a spent landing page.

`await refreshUser()` before navigating is FINDING M-2's remedy. It is wrapped: if `/me` rejects,
the page falls to `state: failed` (C-6) rather than navigating into a `ProtectedRoute` bounce.

### 2.5 `LoginPage`

The Google `<a href="/api/auth/login">` block is unchanged. Beneath it: a separator and
`<MagicLinkRequestForm />`. The existing `?deleted=1` banner and the Privacy/Terms footer are
untouched.

### 2.6 `capture.ts`

```ts
  { source: "authApi.magicLinkRequest", run: () => authApi.magicLinkRequest("a@b.com") },
  { source: "authApi.magicLinkVerify", run: () => authApi.magicLinkVerify("t") },
```

Required — `exercisedMethodGaps()` (`capture.ts:165-178`) enumerates `Object.keys` of every
`EXERCISED_APIS` member and reports uncovered methods, so omitting them turns the web meta-test red.

**Stated so it does not surprise a later reader:** the capture's mocked fetch returns
`{ ok: true, data: {}, error: null, meta: {} }` (`capture.ts:203`), so `magicLinkVerify` will hit
its `MAGIC_LINK_UNEXPECTED_RESPONSE` throw during capture. That is fine and is by design — the
per-invocation `catch {}` at `:212-217` exists for exactly this, and the URL is recorded at
`:201` before the body is ever read.

---

## §3 — Copy (10e-R177). Verbatim. None of it ships unruled.

**C-1 — verify failure, the R14 string.** Rendered for `MAGIC_LINK_INVALID` only.

> **This sign-in link is no longer valid.**
> Links expire after 15 minutes, are single-use, and requesting a new link replaces any earlier one. Request a fresh link below.

True in all four causes without naming which: *expired* → "expire after 15 minutes"; *consumed* →
"single-use"; *superseded* → "replaces any earlier one"; *never existed* → covered by the flat
"no longer valid" with no claim that it ever was. The wording is R14's shape plus the
single-use clause, which R14's sketch omitted and which is needed for the *consumed* cause to be
named at all.

**C-2 — request submitted.** BLOCKING byte-identical for known and unknown.

> **Check your email.**
> If that address has an account — or is ready to have one — we've sent a sign-in link. It expires in 15 minutes.

The "or is ready to have one" clause is what lets one sentence be true both ways. The rejected
alternative is R14's named footgun: "we've sent you a sign-in link" vs "…a link to create your
account" reintroduces the enumeration oracle in one line.

**C-3 — client-side email validation.**

> Enter your email address.

**C-4 — request throttled (429).**

> Too many sign-in link requests. Please wait a few minutes and try again.

**C-5 — request failed (anything else).**

> We couldn't send the sign-in link. Please try again.

**C-6 — verify failed for a non-token reason.** Transport, 429 on verify, `/me` failure,
unexpected shape.

> **We couldn't complete sign-in.**
> Something went wrong on our side. Request a fresh link below, or try again in a moment.

**Why C-6 is separate from C-1, and why it is not an oracle.** R14's uniformity requirement binds
the four *token* causes, which the server already collapses into one 400 body — the frontend
cannot distinguish them even if it wanted to. C-6 fires on transport and server-health conditions,
which carry no information about a token's state or an account's existence. Folding them into C-1
would make C-1 false for causes it names (a network drop is not an expired link), and R177(a)
requires C-1 to be *true* in the causes it covers.

**C-7 — labels and affordances.** Field label `Email address`; submit button `Email me a sign-in link`;
on `/login`, the separator text `or`.

**Named collision avoided by construction (§8 F-1):** none of C-1…C-7 places the substring
"sign in" inside a *heading*.

---

## §4 — 10e-R186 disposition: **(c)**, with the weight assigned explicitly

The exposure is real and 1.6's measurement makes it concrete: 39 frontend test files exist on
disk, **0** are in the type program, so any fixture 10e-4 adds can assert a shape the server never
sends and every gate stays green. `money-wire-shape.assert.ts` **is** in the program
(`fe-listfiles.txt:175`), so option (b)'s precedent is live.

**I propose (c), and I explicitly decline the obvious form of (b).**

**What carries the weight: the runtime narrowing in §2.2.** It is not a type claim, so the
exclusion cannot defeat it, and it does three things a declared type cannot:

1. A server/client disagreement becomes a **loud, single-site, testable failure**
   (`MAGIC_LINK_UNEXPECTED_RESPONSE`) instead of a silent `undefined` — which is the exact defect
   class of 9.4's `/me` stub, where a 200 with the wrong payload passed smoke for months.
2. **It inverts FIND-S5(b).** A test fixture with the wrong shape does not quietly pass — it makes
   `magicLinkVerify` throw, and the test that fed it goes **red**. The guard moves from the type
   layer, which does not reach test files, into the runtime layer, which does. This is the only
   part of the proposal that actually closes the named exposure.
3. It is checked by tsc where tsc does reach: `api.ts` and `MagicLinkPage.tsx` are both non-test
   source, so the discriminated union is enforced at every consumer.

**Why I decline an authored `AssertEqual` pin.** The natural (b) here would be
`AssertEqual<MagicLinkVerifyResult, …>` in an in-program file. But I would author both the type
and the pin from the same paste in §1.1, so they agree **by construction** — the pin holds for the
same reason its subject does. That is a degenerate pin, and 10e-R167 (persisted,
`phase4-10e.md:1766`) has just retired one in this very module for precisely that shape. Proposing
another, one sub-commit later, would be adding an instrument that shares its mechanism with what
it measures (10e-R168, persisted, `:1774`). `money-wire-shape.assert.ts` escapes this only because
its right-hand side is **generated from a runtime capture** (B4-2-R6), not transcribed by the
person writing the type.

**What is NOT closed, stated plainly.** Nothing in 10e-4 verifies the frontend's declared shape
against the running server *before* deploy. The declared types in §2.2 are transcribed once from
the source pasted in §1.1 and are a claim. Two things bound the residual: the transcription is
visible in this document beside the source it came from, and the runtime narrowing converts a
wrong transcription from a silent misroute into a failure at one named site.

**What would actually close it, named rather than gestured at:** extending the B4-1 runtime
capture beyond money leaves to whole wire shapes, generating assertions the way B4-2 does. That is
a chartered cycle with its own cost — B4-1's money predicate and NULL fail-loud guard are blocking
clauses under TB-R13, and widening them is explicitly not a change to make in passing. It
strengthens `TODO(module-9-contract-validation)`, which this proposal does not attempt to discharge.

**Related, and recommended as a separate queue item, not bundled:** removing
`src/**/*.test.ts(x)` from `apps/web/tsconfig.json`. `apps/api` has no such exclusion and its test
files ARE type-checked, which is the precedent proving it is achievable. Its cost is unmeasured —
it would surface an unknown error count across 39 files. That is B4-3-R2 and it is not 10e-4 work.

---

## §5 — 10e-R175(b) / 10e-R161 disposition — **DECISION REQUESTED**

R161's queued item: after 10e-3b, a legitimate user hitting the callback's `:163` token-exchange
failure or the merged `:170` boundary gate lands on a bare `/login` with no diagnostic.

**My proposed disposition is a split: the recovery half is discharged structurally and for free;
the acknowledgement half is scoped OUT of 10e-4 with reasoning.**

**The recovery half — discharged, by 10e-4's own LoginPage change, with no mechanism at all.**
R14's stated concern is that *"a dead end with no recovery affordance is the actual failure."*
Before 10e-4, bare `/login` offers one path: retry the Google button that just failed. After
10e-4 it offers two live sign-in paths, one of which does not involve the failing dependency.
The dead end closes as a side effect, carrying zero information and requiring zero parameter.

**The acknowledgement half — scoped out.** Telling the user *that* something failed requires
carrying one bit from the callback to `/login`, and every available channel is disqualified:

- **A query parameter**, even single-valued, is rejected by R161's own reasoning, which I take as
  the standard: a param with one value carries no information but invites a second, and that is
  how an oracle is reintroduced by a later well-meaning commit.
- **Redirecting to `/auth/magic` instead** would reuse C-1's copy for a cause it is false about
  (an OIDC token-exchange failure is not an expired link), and a different destination is itself
  the distinguishing signal.
- **A server-set flash cookie** satisfies the constraint if it is **value-less** — its presence
  means "sign-in did not complete", with no cause encoded — but it is new `apps/api` surface. Adding
  it here would change 10e-4 from a frontend sub-commit into a frontend-plus-auth-callback
  sub-commit, which is exactly the review-ergonomics property 10e-3b was split out to protect
  (A8 Change 1).
- **An unconditional message on `/login`** would tell every ordinary visitor that their sign-in
  failed, which is false for almost all of them.

**Recommendation:** accept the structural discharge, and queue the acknowledgement as its own
cycle with the value-less cookie as the named candidate. If the operator instead rules that the
acknowledgement ships in 10e-4, the cookie is the only mechanism I can defend, and 10e-4 acquires
an `apps/api` change that should be named in the ruling rather than absorbed.

---

## §6 — Test plan

Gate idiom for every case below: **plain `it`, no `skipIf`.** These are frontend Vitest cases;
there is no INTEGRATION mode in `apps/web`, so 10e-R144(c)'s two-idiom question does not arise and
no case lands in any skipped column.

**Row-vs-test distinction (10e-R126, persisted, `phase4-10e-3a-proposal.md:1526`): each row below
is exactly ONE `it`. No row is a loop, and no row yields more than one test.** Predicted delta is
the row count, and the reconciliation in §7 is against this table.

### New file — `apps/web/src/components/auth/MagicLinkRequestForm.test.tsx`

| # | case | what it observes |
|---|---|---|
| 1 | submits the trimmed address and renders C-2 | `authApi.magicLinkRequest` called with `"a@b.com"` for input `"  a@b.com  "`; C-2 in the DOM |
| 2 | **BLOCKING R177** — C-2 is byte-identical for two different addresses | renders twice, captures `textContent` of the confirmation node, asserts strict equality |
| 3 | empty input renders C-3 and issues **no** request | `magicLinkRequest` not called |
| 4 | `rate_limit_exceeded` renders C-4 | — |
| 5 | any other `ApiError` renders C-5, and C-2 is absent | absence assertion so a "success on failure" regression is caught |

### New file — `apps/web/src/components/pages/MagicLinkPage.test.tsx`

| # | case | what it observes |
|---|---|---|
| 6 | `{kind:"session", isNewUser:false}` → `refreshUser` awaited, then `navigate("/", {replace:true})` | call order asserted, not just occurrence |
| 7 | `{kind:"session", isNewUser:true}` → `navigate("/welcome?source=signup", {replace:true})` | — |
| 8 | `{kind:"pending_2fa"}` → `navigate("/auth/2fa-verify", {replace:true})` and `refreshUser` **not** called | the negative half is the point: no session exists yet |
| 9 | **BLOCKING R177(b)** — `MAGIC_LINK_INVALID` renders C-1 **and** the form, with the form **after** C-1 in document order | `compareDocumentPosition`, so "beneath" is asserted rather than assumed |
| 10 | **the failure copy is a constant** — two 400s carrying *different* server `error` strings render byte-identical C-1 | catches a later `{err.message}` render, which would leak server-side wording into the uniform surface |
| 11 | **StrictMode guard** — rendered inside `<StrictMode>`, `magicLinkVerify` is called exactly once | explicitly wrapped; `App.tsx` does not wrap, so without this the case asserts nothing (§1.7) |
| 12 | the token is removed from the URL before the POST resolves | `history.replaceState` spy called with `"/auth/magic"`; asserted **before** the verify promise settles |
| 13 | no `?token` → the form renders and C-1 is **absent**; `magicLinkVerify` not called | the post-scrub reload state |
| 14 | `refreshUser()` rejection → C-6, and **no** navigation | FINDING M-2's failure arm |
| 15 | a non-`MAGIC_LINK_INVALID` failure renders C-6, not C-1 | pins the §3 split |

### Existing file — `apps/web/src/lib/api.test.ts` (10 `it` today)

| # | case | what it observes |
|---|---|---|
| 16 | `magicLinkRequest` POSTs `/api/auth/magic-link/request` with `{email}` | URL **and** body |
| 17 | `magicLinkVerify` narrows `{pending_2fa:true}` → `{kind:"pending_2fa"}` | — |
| 18 | `magicLinkVerify` narrows `{is_new_user:true}` → `{kind:"session", isNewUser:true}` | — |
| 19 | **the §4 guard** — a 200 whose `data` is `{}` throws `MAGIC_LINK_UNEXPECTED_RESPONSE` | the case that makes a wrong fixture red |

### Existing file — `apps/web/src/components/pages/LoginPage.test.tsx` (5 `it` today)

| # | case | what it observes |
|---|---|---|
| 20 | LoginPage renders the email form **and** still renders the Google link | co-presence, so neither path silently replaces the other |

**Total: 20 new `it`, 2 new files.**

**Not proposed, and why:** no case asserts that the *four token causes* are indistinguishable end
to end. They arrive as one server body, so any frontend test of that property would be asserting
something the frontend cannot influence — an instrument sharing its mechanism with its subject
(10e-R168). Case 10 pins what the frontend *can* get wrong: rendering server-supplied text.

---

## §7 — Baselines and predicted deltas

Re-derived at execution against the then-current measured baseline; nothing carried (10e-R179 as
amended by 10e-R182).

| gate | measured at HEAD `c6103c5`, Step 0 | predicted after 10e-4 |
|---|---|---|
| frontend `test:unit` | **185 passed / 39 files**, exit 0 | **205 passed / 41 files**, exit 0 |
| frontend `tsc --noEmit` | **0**, 0 bytes | 0 |
| contract fixture | **64** entries | **66** |
| contract ALLOWLIST | **empty** | empty |
| API hermetic | 873 / 34 / 61, exit 0 | unchanged — no `apps/api` file is touched |
| INTEGRATION | 897 / 10 / 0, exit 0 | unchanged, and **not run** |

**Delta: +20 tests, +2 files.** Derived from the §6 table by row count, one `it` per row, and the
table is therefore checkable against the prose above it (10e-R172, persisted, `phase4-10e.md:1820`).

**The +20 overshoots A8's predicted +8–10, and that is declared here rather than discovered at
close (10e-R137b).** The overshoot is accounted for, not absorbed:

- A8 predicted a page and two api methods. It predates R177, which made **three** properties
  BLOCKING and each requires its own red-provable case — cases 2, 9 and 10.
- §4's disposition adds the api-layer narrowing cases 17–19, which did not exist as a concept
  when A8 was written.
- Cases 11–14 come from measurements made in this proposal — StrictMode (§1.7), the URL scrub
  (§1.8), and FINDING M-2's failure arm (§1.6) — none of which A8 could have anticipated.

If the count at execution is not exactly 20 / +2 files, that is a question and gets investigated
before it is absorbed, in all three columns.

**INTEGRATION obligation: NONE, confirmed against what is actually proposed rather than inherited
from A8** (10e-R175). No file under `apps/api` is touched; no `db.transaction()` boundary is
crossed; no `*.integration.test.ts` file is added or edited. The obligation does not fire.

**Errors instrument.** The exact CI command must exit 0 with no `Errors` / `Unhandled Errors` /
`Unhandled Rejection` section, checked with the 10e-R133 pattern. Per 10e-R181(b) the frontend
control is **synthetic**: feeding the pattern a hand-written `     Errors  1 error` proves the
pattern matches that string, not that vitest's frontend reporter emits it. Its independence from
the exit code is likewise undemonstrated. Both go in the 10e-close bounded-unknown record beside
10e-R134 and 10e-R168. This close-out will not write "two independent instruments".

---

## §8 — Constraints, and the forced-edit risks found by measurement

The three named regression files stay green **and untouched**, demonstrated with an empty
`git diff --stat` over those paths, not asserted:
`components/layout/AppShell.test.tsx`, `components/pages/legal/PrivacyPolicyPage.test.tsx`,
`components/pages/legal/TermsPage.test.tsx`. None is on any path 10e-4 edits.

Design-track constraints, all applicable and all met by the design: no renames; logical properties
only (no `ml-`/`mr-`/`pl-`/`pr-`); `components/ui/*` untouched and direction-free; the 5.3 FAB
topology and its pinned strings untouched; the two legal `data-testid`s untouched.

**"No test impact expected" is a prediction, not an allowance — so here are the two collisions I
found by reading the existing tests, named in advance rather than met in a red run.**

**F-1 — a heading collision that would break an existing LoginPage assertion.**
`LoginPage.test.tsx:24`:

```tsx
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument()
```

`getByRole` **throws on multiple matches**. Today it resolves to `<h2>Sign in</h2>`
(`LoginPage.tsx:63`). Adding any second heading whose accessible name matches `/sign in/i` — the
natural "Sign in with email" — turns this red and forces an edit to a test 10e-4 did not set out
to touch. **Avoided by construction:** §3's C-7 uses a field label and a button
(`Email me a sign-in link`), never a heading, and the separator is the single word `or`. Buttons
are `role="button"`, not `role="heading"`, so the query is unaffected. **No forced edit.**

**F-2 — the `?deleted=1` absence assertion.** `LoginPage.test.tsx:52` asserts
`/your account has been deleted/i` is absent without the param. None of C-1…C-7 contains that
phrasing. **No forced edit.**

`error-reporter.test.ts:4` imports `{ ErrorBoundary } from "@/App"` — the only test that imports
from `App.tsx`. It does not render the route table, so adding a `<Route>` cannot affect it.

**If any other red test or forced selector edit appears during implementation, it is a NAMED
forced edit and stops for approval before it ships** (5.3 precedent).

---

## §9 — Guards, and how each is proven able to fail, in both directions

Every mutation is applied to the **shipped** file, the red captured, then reverted with a
`diff`-identical restore proof.

**G-1 — C-2 byte-identity (case 2).**
*Red direction A:* make the confirmation branch on whether the address is known — impossible
through the API by design (§2.2 returns `void`), so the mutation is to branch on the address
itself (e.g. append the domain). Expect case 2 red.
*Red direction B:* the pin must not hold by construction. Both renders route through one
component, so an equality assertion between two renders of the same constant is **degenerate in
exactly the 10e-R167 sense.** The non-degenerate form is therefore required and proposed: case 2
asserts equality across renders **driven by different props** (two addresses), and the mutation
in direction A is what distinguishes them. If direction A cannot be made to redden case 2, the pin
is degenerate and I will report that rather than ship it.

**G-2 — C-1 rendered from a constant (case 10).**
*Red:* change the page to render `err.message`. The two 400s carry different server strings, so
case 10 goes red. *Green:* restore. Direction B: with the mutation applied, case 9 stays **green**
(it only checks C-1's presence and the form's position), which is what proves case 10 is carrying
its own weight rather than duplicating 9.

**G-3 — the StrictMode single-consume latch (case 11).**
*Red:* remove the `useRef` latch; under `<StrictMode>` the effect double-invokes and
`magicLinkVerify` is called twice. *Direction B, and it is the one that matters:* with the latch
removed, the case **must be run outside StrictMode too** and shown to stay green there — otherwise
the test could be passing because the harness never double-invokes, which is a real possibility
given `App.tsx` does not wrap (§1.7). Both runs get captured.

**G-4 — the URL scrub ordering (case 12).**
*Red A:* delete the `replaceState` call → red. *Red B:* move it to **after** the `await` → the case
asserts the spy fired before the verify promise settles, so it goes red for the ordering rather
than for the presence. Direction B is the load-bearing one: presence alone would be satisfied by a
scrub that happens too late to matter if the request hangs.

**G-5 — the `MAGIC_LINK_UNEXPECTED_RESPONSE` narrowing (case 19).**
*Red A:* replace the throw with `return { kind: "session", isNewUser: Boolean(data.is_new_user) }`
→ case 19 red. *Red B:* the guard's real job is to redden a wrong **fixture**; to prove it does,
one component-test fixture is temporarily changed to `{ is_new_user: "true" }` (a string) and the
consuming case must go red. That is the §4 claim under test, and if it does not redden, §4's
disposition is wrong and I will report it.

**G-6 — form-beneath-copy ordering (case 9).**
*Red:* render the form above C-1 → `compareDocumentPosition` red. A presence-only assertion would
stay green, which is why the positional form is proposed.

Failure-injection cases assert the **specific** expected error, never merely that something threw
(the 10d-0 bare-`catch{}` rule).

---

## §10 — What is explicitly NOT in this sub-commit

- **10e-R129** — cross-family token presentation. Hypothesis, unmeasured, own cycle post-10e.
- **The operator-drafted Privacy Policy copy commit (10e-R12).** Not drafted here; confirmed at
  10e-close.
- **10e-close items** — the 10e-R124 public-API-contract entries for the two verify shapes, the
  bounded-unknown record on the Errors instruments, queue reconciliation, and the production
  end-to-end send proof (10e-R15 / 10e-R147).
- **10e-R85 / 10e-R72** — the non-ASCII local-part user.
- **B4-3-R2** — removing the frontend tsconfig test exclusion (§4).
- **`TODO(module-9-contract-validation)` / `TODO(module-9-network-mocking)`** — §4 states what
  would close them; 10e-4 does not.

---

## §11 — Decisions requested

1. **§5 — the 10e-R161 split.** Accept the structural discharge of the recovery half and queue the
   acknowledgement half, or rule that it ships in 10e-4 with the value-less cookie (which makes
   this an `apps/api`-touching sub-commit).
2. **§3 — all seven copy strings**, C-1 … C-7, ruled before implementation.
3. **§4 — the R186 disposition (c)**, including the explicit decline of an authored `AssertEqual`
   pin on 10e-R167 grounds.
4. **§7 — the +20 / +2 delta** overshooting A8's +8–10, with the accounting given.
5. **§6 case 2 and §9 G-1** — confirm the non-degenerate form is what is wanted, since the
   degenerate form is the easy one to write.

---

## §12 — EXECUTION AMENDMENTS (2026-08-21)

Recorded here rather than by editing §1–§11, so the proposal stays a record of what was
submitted and this section is the record of what changed. Every item names the ruling or the
measurement that caused it.

### 12.1 — §6 case 2 is RE-POINTED (10e-R194), and the case list now says so

**Superseded:** the original case 2, "C-2 is byte-identical for two different addresses."
It is **DEGENERATE BY CONSTRUCTION** — the server returns ONE fixed 200 envelope built outside
every branch, so the frontend receives identical input both times, and the assertion would hold
against a component that branched on a response field the server never varies. Unlike the
10e-R167 case, it is not repairable by re-pointing at a sibling cause: there is no independent
path on this side to point at.

**What case 2 tests now:** *independence from the response and the input* — the rendered
confirmation is byte-equal to the ruled literal, so interpolating anything breaks it. The
cross-address property lives on the SERVER and is already pinned there by 10e-2's fixed-envelope
and mail-identical cases; it is CITED at 10e-close, not re-pinned here.

### 12.2 — the error split is THREE-way, not two (10e-R191's C-3 condition)

§2.3 proposed 429 → C-4 and everything else → C-5. Deciding where format rejection lives
(R191's C-3 condition) added a middle branch: a 400 `validation_error` surfaces the **server's**
message verbatim. Its messages are static literals with no interpolation
(`routes/magic-link.ts:167-174`), so surfacing them leaks nothing, and inventing a parallel
string would create a second driftable copy of the same claim. Costs one case.

### 12.3 — `?token=` (present but empty) is treated as ABSENT

Not in the proposal. It falls out of R191's C-6 enumeration: `""` would be rejected by the
server's zod `min(1)` as a `validation_error`, spending a rate-limit slot to learn what the
client already knows. Costs one case.

### 12.4 — the C-3 answer is the opposite of what §2.3 assumed, and it is MEASURED

§2.3 said client-side validation "deliberately does NOT replicate the server's zod `.email()`".
**That is false as implemented**, and the component comment now says so. `<input type="email">`
applies HTML5 constraint validation, whose email grammar is ASCII-only: measured against this
repo's jsdom 26.1.0, `"josé@x.com"` gives `validity.typeMismatch === true` and
`form.checkValidity() === false`. It is therefore a **second site** emitting the claim 10e-R85
records as false, with the browser's own non-ruled, non-localizable message.

**Kept and named, per R191** ("name it, do not fix R85 here, do not enlarge it silently"): it is
the correct input semantics, and it does not enlarge R85 — the server refused that user anyway;
this refuses sooner. Consequence for the ruled copy: C-3 covers exactly one state, **empty** —
and a whitespace-only entry arrives already empty, because `type="email"` value-sanitization
strips whitespace before React's `onChange` sees it. The `validation_error` branch is a genuine
fallback for when constraint validation does not run, so its test drives `fireEvent.submit`
directly; a click never reaches the handler, and an unexercised branch is the defect the gate-3
omission demonstrated once already.

### 12.5 — R191's C-6 condition: every response the verify handler can emit

From source, with the branch each falls into. The client split is exhaustive because the
default arm is C-6, and exactly one response reaches C-1.

| # | source | status | `code` | branch |
|---|---|---|---|---|
| 1 | `perIpVerifyLimiter` | 429 | `rate_limit_exceeded` | C-6 |
| 2 | `globalVerifyLimiter` | 429 | `rate_limit_exceeded` | C-6 |
| 3 | `JSON.parse` catch, `:453` | 400 | `invalid_json` | C-6 |
| 4 | zod, `:457` | 400 | `validation_error` | C-6 |
| 5 | `failVerify` ×5, `:441` | 400 | `MAGIC_LINK_INVALID` | **C-1** |
| 6 | TOTP handoff, `:652` | 200 | — | navigate `/auth/2fa-verify` |
| 7 | session, `:675` | 200 | — | navigate `/` or `/welcome?source=signup` |
| 8 | `app.onError`, `app.ts:86` | 500 | **none** | C-6 |
| 9 | `app.notFound`, `app.ts:69` | 404 | **none** | C-6 |

Client-side-only outcomes — network failure, `MAGIC_LINK_UNEXPECTED_RESPONSE`, a `refreshUser`
rejection — also land in C-6. Note that #8 and #9 carry **no `code` field at all**, so
`readErrorCode` returns `undefined` and the default arm is what catches them; a split whose
default were C-1 would mis-describe a 500 as a spent link.

### 12.6 — §9 G-2's direction-B control was WRONG, and the corrected mutation is recorded

§9 predicted that rendering `err.message` would redden case 12 while case 11 stayed green,
"which proves case 12 is carrying its own weight". **Measured: it reddens BOTH** — case 11
asserts `toContain(INVALID_TITLE)` on the container, so replacing the title breaks it too. The
mutation does not discriminate.

**The discriminating mutation appends the server text to the BODY**: case 11's `toContain` on
the container still passes, case 12's `toBe(INVALID_BODY)` goes red alone (1 failed / 11 passed).
Recorded rather than silently substituted, because a control that does not control is the
10e-R168 class and the proposal asserted this one would work.

### 12.7 — the M-2 pins did not initially detect a missing `await`, and that is the more serious finding

Dropping the `await` before `refreshUser` was predicted to redden the post-condition case.
**Measured: it reddened only the `/me`-FAILURE case.** Cause: the `refreshUser` mock's body was
synchronous, so it set auth state before the very next statement ran, and `void refreshUser();
navigate(...)` still found the user populated. **Both the post-condition pin and the ordering
pin would have stayed GREEN against code that never awaits** — the instrument sharing a timing
assumption with the thing it measures.

Fixed inside 10e-4's own new test file (not a forced edit to an existing test) by giving the
mock a real `setTimeout` boundary. Re-run: the same mutation now reddens **6** cases including
both pins. The mock's comment records why the boundary is load-bearing, so a later "simplify
this mock" does not silently restore the hole.

### 12.8 — a third non-discriminating instrument, found in passing

Grepping the run output for a per-test `✓` line to confirm a case stayed green returns **0
whether it passed or not**, because vitest prints no per-test `✓` lines for a failing file. It
returned 0 under both the wrong mutation and the right one. The discriminating evidence is the
**exhaustive `×` list plus the pass count**, and that is what the close-out reports.

### 12.9 — final measured figures

Frontend **209 / 41**, exit 0, Errors-instrument 0; `tsc` 0 at 0 bytes. API **873 / 34 / 61**,
exit 0, Errors 0; `tsc` 0 — unchanged, and run because
`apps/api/src/contract/frontend-contract.test.ts` reads the fixture, which moved **64 → 66**
with the ALLOWLIST still empty. Delta **+24 / +2** against the predicted **+20 / +2**; the file
column landed, the test column missed by 4 and each of the four is accounted for in 12.2, 12.3,
10e-R190(ii)'s ordering pin, and 10e-R189(i)'s branch-order pin.

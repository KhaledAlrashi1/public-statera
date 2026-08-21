import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Scale } from "lucide-react"
import { authApi, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import MagicLinkRequestForm from "@/components/auth/MagicLinkRequestForm"

/*
 * MagicLinkPage — the /auth/magic landing page (Module 10e-4).
 *
 * Reached by clicking the mailed link, which carries the raw token as ?token=
 * (routes/magic-link.ts:280). This is a STANDALONE route OUTSIDE ProtectedRoute:
 * the clicker has NO session at mount — the POST below is what creates one — so
 * inside ProtectedRoute `user` would be null, the page would never render, the
 * token would never be sent, and every magic link would be broken. Same reasoning,
 * and the same placement, as /auth/2fa-verify and /delete-account/confirm.
 *
 * WHY refreshUser() IS AWAITED BEFORE NAVIGATING (FINDING M-2, 10e-R190).
 * The OIDC path establishes session state by ACCIDENT of being a full-document
 * redirect: the SPA reboots, AuthContext's mount-only effect (AuthContext.tsx:75-87,
 * deps `[]`) runs with the cookie already present, and /me returns the user. This
 * path has no reboot — the SPA mounted BEFORE any session existed, so that effect
 * already ran and already set user = null, and a client-side navigate() does not
 * remount the provider. Without the explicit refetch the user is navigated to a
 * ProtectedRoute destination with user still null, ProtectedRoute fires
 * <Navigate to="/login">, and a fully signed-in user lands on the sign-in page.
 * That is the 9.4 defect class (route correct, frontend reads undefined,
 * ProtectedRoute bounces), which survived a smoke test that checked only for 200.
 *
 * WHY THE SCRUB HAPPENS BEFORE THE REQUEST (10e-R195(a)).
 * Scrubbing after the response leaves a live window in which a reload re-sends a
 * token the in-flight request is consuming, so the reloaded page shows the
 * link-invalid copy to a user who actually succeeded, with the session's fate
 * depending on which request landed first. Scrubbing first closes that window: a
 * reload after it lands on /auth/magic with NO token, which renders the request
 * form — a recoverable state. A browser BACK navigation onto the scrubbed entry
 * renders the same thing, the request form, because the entry no longer carries a
 * token and the page has nothing to verify.
 *
 * window.history.replaceState is used directly rather than setSearchParams: the
 * artifact being cleaned is the address bar and the history entry, replaceState is
 * the minimal synchronous operation on exactly that, and going through the router's
 * navigation pipeline would make the scrub asynchronous with respect to the request
 * it must precede. Router state keeping a stale search value is inert — nothing
 * reads it again (the latch below guarantees one read).
 */

// Copy ruled verbatim by 10e-R191 (2026-08-21). C-1 says "isn't valid", NOT
// "is no longer valid": "no longer" is a temporal claim meaning not now, though
// formerly — the exact assertion 10e-R14 refused 410 Gone for, since it is itself
// the distinguishing signal the uniform failure exists to suppress. One string,
// all five causes, no information carried.
const INVALID_TITLE = "This sign-in link isn't valid."
const INVALID_BODY =
  "Links expire after 15 minutes, are single-use, and requesting a new link replaces any earlier one. Request a fresh link below."
const FAILED_TITLE = "We couldn't complete sign-in."
const FAILED_BODY =
  "Something went wrong on our side. Request a fresh link below, or try again in a moment."

type Phase = "verifying" | "form" | "invalid" | "failed"

export default function MagicLinkPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  // `?token=` with an empty value is treated as ABSENT rather than posted: the
  // server would reject "" with a zod validation_error, spending a rate-limit slot
  // to learn what the client already knows.
  const token = (searchParams.get("token") ?? "").trim()

  const [phase, setPhase] = useState<Phase>(token ? "verifying" : "form")

  // Single-consume latch. StrictMode double-invokes effects in development
  // (main.tsx:27), and a second invocation would POST a token the first invocation
  // has already consumed — showing the link-invalid copy to a user who just
  // succeeded. The server's atomic consume protects the SERVER, not this client.
  // A ref, not state: it must be set synchronously, before the first await.
  const started = useRef(false)

  useEffect(() => {
    if (!token) return
    if (started.current) return
    started.current = true

    // BEFORE the request — see the header note.
    window.history.replaceState(null, "", window.location.pathname)

    void (async () => {
      try {
        const result = await authApi.magicLinkVerify(token)
        if (result.kind === "pending_2fa") {
          // The pending cookie is already committed by the time this promise
          // resolves; TwoFactorVerifyPage tolerates arrival with no ?intent param
          // and routes onward to "/" itself. No session exists yet, so refreshUser
          // is deliberately NOT called here — /me would 401.
          navigate("/auth/2fa-verify", { replace: true })
          return
        }
        await refreshUser()
        navigate(result.isNewUser ? "/welcome?source=signup" : "/", { replace: true })
      } catch (err) {
        setPhase(
          err instanceof ApiError && err.code === "MAGIC_LINK_INVALID" ? "invalid" : "failed",
        )
      }
    })()
    // Mount-only by design: the token is read once and consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="icon-shell h-11 w-11 border-primary/20 bg-primary/10 text-primary">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Statera
            </p>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Email sign-in</h1>
          </div>
        </div>

        {phase === "verifying" && (
          <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            Signing you in...
          </div>
        )}

        {phase === "invalid" && (
          <div
            data-testid="magic-link-invalid"
            className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm"
          >
            <p className="font-semibold text-foreground" data-testid="magic-link-invalid-title">
              {INVALID_TITLE}
            </p>
            <p className="text-muted-foreground" data-testid="magic-link-invalid-body">
              {INVALID_BODY}
            </p>
          </div>
        )}

        {phase === "failed" && (
          <div
            data-testid="magic-link-failed"
            className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm"
          >
            <p className="font-semibold text-foreground" data-testid="magic-link-failed-title">
              {FAILED_TITLE}
            </p>
            <p className="text-muted-foreground" data-testid="magic-link-failed-body">
              {FAILED_BODY}
            </p>
          </div>
        )}

        {/* 10e-R14: the request form is rendered on this same view, BENEATH the
            failure copy — a spent link must never be a dead end. */}
        {phase !== "verifying" && <MagicLinkRequestForm autoFocus={phase === "form"} />}
      </div>
    </div>
  )
}

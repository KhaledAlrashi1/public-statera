import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle } from "lucide-react"
import { accountApi, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/*
 * DeleteAccountConfirmPage — final, irreversible step of account deletion.
 *
 * Reached only after OIDC re-auth (delete-reauth flow): the backend redirects the
 * browser here (routes/auth.ts: no-TOTP path → /delete-account/confirm; TOTP path →
 * /auth/2fa-verify?intent=delete → this page) with a short-lived statera_delete_intent
 * cookie (Path=/api/account, 15-min). This is a STANDALONE route OUTSIDE ProtectedRoute:
 * the delete flow issues no session, so there is no authenticated shell here — that is
 * also why no stale shell can flash between success and the /login landing.
 *
 * The cookie is httpOnly and unreadable client-side, so we don't pre-check it — we
 * attempt DELETE /api/account and handle its error codes (410/403/500).
 */

const CONFIRM_WORD = "DELETE"

type TerminalError = "expired" | "inactive"

export default function DeleteAccountConfirmPage() {
  const navigate = useNavigate()
  const { resetAuthState } = useAuth()
  const [confirmText, setConfirmText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [terminalError, setTerminalError] = useState<TerminalError | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const canDelete = confirmText === CONFIRM_WORD && !submitting

  async function handleDelete() {
    if (!canDelete) return
    setSubmitting(true)
    setInlineError(null)
    try {
      await accountApi.deleteAccount()
      // Server has cleared the session cookie; tear down client state without a
      // network logout, then land on /login with a deletion confirmation.
      resetAuthState()
      navigate("/login?deleted=1", { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        // DELETE_INTENT_GONE — cookie expired/absent/mismatched (the 15-min dawdle).
        setTerminalError("expired")
      } else if (err instanceof ApiError && err.status === 403) {
        // ACCOUNT_INACTIVE — already deleted.
        setTerminalError("inactive")
      } else {
        // deletion_failed (500) or anything unexpected — recoverable, allow retry.
        setInlineError("Something went wrong deleting your account. Please try again.")
        setSubmitting(false)
      }
    }
  }

  if (terminalError) {
    const isExpired = terminalError === "expired"
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isExpired ? "Verification expired" : "Account already deleted"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isExpired
                ? "For your security, the verification window closed before the account was deleted. Please start again."
                : "This account has already been deleted. Sign in is no longer available for it."}
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => navigate(isExpired ? "/profile" : "/login", { replace: true })}
          >
            {isExpired ? "Start over" : "Go to sign in"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Delete your account</h1>
          <p className="text-sm text-muted-foreground">
            This permanently deletes your account and all associated data. This action cannot be
            undone.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleDelete()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              disabled={submitting}
            />
          </div>
          {inlineError && <p className="text-sm text-destructive">{inlineError}</p>}
          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            loading={submitting}
            disabled={!canDelete}
          >
            {submitting ? "Deleting..." : "Permanently delete my account"}
          </Button>
        </form>
      </div>
    </div>
  )
}

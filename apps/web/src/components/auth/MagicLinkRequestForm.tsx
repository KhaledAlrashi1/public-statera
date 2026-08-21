import { useState } from "react"
import { Mail } from "lucide-react"
import { authApi, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/*
 * MagicLinkRequestForm — the email sign-in request form (Module 10e-4).
 *
 * ONE component, rendered in TWO places: LoginPage (a second sign-in path beside
 * "Continue with Google") and MagicLinkPage (10e-R14 requires the request form
 * DIRECTLY BENEATH the failure copy, so a spent link is never a dead end).
 *
 * Why one and not two (10e-R176 item 10): 10e-R177 makes the request-submitted
 * confirmation BYTE-IDENTICAL for a known and an unknown address, BLOCKING. That is
 * a shared CONTRACT in the sense 10e-R9/R63 protect, not merely repeated characters
 * — two copies could satisfy it the day they are written and drift the first time
 * one is edited. With one component the property is STRUCTURAL: there is one string,
 * so there cannot be two.
 *
 * The uniformity is additionally structural at the API layer: authApi.magicLinkRequest
 * returns `void`, because the server's 200 body is one fixed envelope built outside
 * every branch (routes/magic-link.ts:302-308). No response field reaches this
 * component, so no branch on one is possible here.
 */

// Copy ruled verbatim by 10e-R191 (2026-08-21, "§3: five strings APPROVED as
// written…"). Do not edit without a ruling; MagicLinkRequestForm.test.tsx pins the
// rendered text against its own independent literals, so a silent change goes red.
const SENT_TITLE = "Check your email."
const SENT_BODY =
  "If that address has an account — or is ready to have one — we've sent a sign-in link. It expires in 15 minutes."
const EMPTY_EMAIL = "Enter your email address."
const THROTTLED = "Too many sign-in link requests. Please wait a few minutes and try again."
const SEND_FAILED = "We couldn't send the sign-in link. Please try again."

type Status = "idle" | "submitting" | "sent"

export default function MagicLinkRequestForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    // 10e-R191's C-3 condition, answered from MEASUREMENT rather than intent.
    //
    // THIS handler's validation covers EXACTLY ONE state: empty. (A whitespace-only
    // entry arrives here already empty — the type="email" value-sanitization
    // algorithm strips leading/trailing whitespace, so React's onChange sees "".
    // The trim() below is therefore belt-and-braces, not the mechanism.)
    //
    // But the FORM as a whole does replicate the server's format predicate, and
    // NAMING that is the point (R191: name it, do not fix R85 here, do not enlarge
    // it silently). <input type="email"> applies HTML5 constraint validation, whose
    // email definition is ASCII-only, so it is a SECOND SITE rejecting a non-ASCII
    // local part — measured against this repo's jsdom 26.1.0: "josé@x.com" →
    // validity.typeMismatch === true, form.checkValidity() === false, so the browser
    // blocks submission and shows its OWN message, not the ruled copy. The user is
    // told their address is invalid when it is not — 10e-R85's claim, one layer
    // earlier than the server's.
    //
    // Kept, not removed: type="email" is the correct input semantics (mobile
    // keyboard, autofill), and it does not ENLARGE R85 — that user was already
    // refused by the server's zod .email(). It is the same refusal, sooner. The
    // fix belongs to R85's own cycle, where the ASCII-only predicate is the subject.
    if (!trimmed) {
      setError(EMPTY_EMAIL)
      return
    }
    setError(null)
    setStatus("submitting")
    try {
      await authApi.magicLinkRequest(trimmed)
      setStatus("sent")
    } catch (err) {
      setStatus("idle")
      if (err instanceof ApiError && err.code === "rate_limit_exceeded") {
        // Safe: reflects the requester's own request rate, and says nothing about
        // whether the address exists.
        setError(THROTTLED)
        return
      }
      if (err instanceof ApiError && err.code === "validation_error") {
        // The server owns the validation vocabulary. Its messages are static
        // literals with no interpolation (routes/magic-link.ts:167-174), so
        // surfacing them leaks nothing; inventing a parallel string here would
        // create a second, driftable copy of the same claim.
        setError(err.message)
        return
      }
      setError(SEND_FAILED)
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        data-testid="magic-link-sent"
        className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-foreground"
      >
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold" data-testid="magic-link-sent-title">
            {SENT_TITLE}
          </p>
          <p className="text-muted-foreground" data-testid="magic-link-sent-body">
            {SENT_BODY}
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="magic-link-form">
      <div className="space-y-2">
        <Label htmlFor="magic-link-email">Email address</Label>
        <Input
          id="magic-link-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="magic-link-error">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={status === "submitting"}>
        Email me a sign-in link
      </Button>
    </form>
  )
}

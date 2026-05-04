import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus("idle")
    setMessage("")
    setLoading(true)
    try {
      const res = await authApi.requestPasswordReset({ email })
      setStatus("success")
      setMessage(res.message || "If an account exists for that email, a reset link has been sent.")
    } catch (err) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : "We couldn't send a password reset link right now.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="section-panel w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Forgot Password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send a secure reset link.
        </p>

        <form onSubmit={submit} className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" loading={loading} disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        <Button asChild variant="outline" className="mt-3">
          <Link to="/login">Back to Login</Link>
        </Button>

        {message && (
          <div className={`mt-4 status-card ${status === "success" ? "status-card-success" : "status-card-danger"}`}>
            {message}
            {status === "success" && (
              <p className="mt-1 text-[13px] opacity-80">
                Check your spam folder if it doesn&apos;t arrive. The link expires in 30 minutes.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

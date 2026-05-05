import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"
import { authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = useMemo(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    return hashParams.get("token") || params.get("token") || ""
  }, [params])
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (token) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [token])

  const submit = async () => {
    if (!token) {
      setStatus("error")
      setMessage("This reset link is incomplete or has expired.")
      return
    }
    setStatus("loading")
    try {
      await authApi.confirmPasswordReset({
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      setStatus("success")
      setMessage("Password reset successfully.")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : "We couldn't reset your password right now.")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="section-panel w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Reset Password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set a new password for your account.
        </p>

        <div className="mt-4 grid gap-3">
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowNew((v) => !v)}
              className="absolute inset-y-0 right-1 h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={showNew ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-1 h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={showConfirm ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={submit}
            loading={status === "loading"}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Saving..." : "Save Password"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>

        {message && (
          <div className={`mt-4 status-card ${status === "success" ? "status-card-success" : "status-card-danger"}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

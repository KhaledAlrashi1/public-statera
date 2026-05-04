import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"

export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams()
  const token = useMemo(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    return hashParams.get("token") || params.get("token") || ""
  }, [params])
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (token) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [token])

  const confirm = async () => {
    if (!token) {
      setStatus("error")
      setMessage("This confirmation link is incomplete or has expired.")
      return
    }
    setStatus("loading")
    try {
      await authApi.confirmEmailChange({ token })
      setStatus("success")
      setMessage("Email change confirmed successfully.")
    } catch (err) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : "We couldn't confirm that email change right now.")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="section-panel w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Confirm Email Change</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm this request to finalize your email update.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={confirm}
            loading={status === "loading"}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Confirming..." : "Confirm"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>

        {message && (
          <div className={`mt-4 status-card ${status === "success" ? "status-card-success" : "status-card-danger"}`}>
            {message}
            {status === "error" && (
              <p className="mt-1 text-[13px] opacity-80">
                If your link has expired,{" "}
                <Link to="/profile" className="underline font-medium">
                  go to your profile
                </Link>{" "}
                to request a new one.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

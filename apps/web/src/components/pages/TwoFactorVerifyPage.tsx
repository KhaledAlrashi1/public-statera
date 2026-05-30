import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function TwoFactorVerifyPage() {
  const [code, setCode] = useState("")
  const [codeType, setCodeType] = useState<"totp" | "backup">("totp")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const { verifyTwoFactor } = useAuth()
  const toast = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await verifyTwoFactor(code, codeType)
      if (result.warning === "BACKUP_CODES_LOW" && result.backupCodesRemaining !== undefined) {
        const n = result.backupCodesRemaining
        toast.warning(
          `Only ${n} backup code${n === 1 ? "" : "s"} remaining — generate new ones from Profile.`,
        )
      }
      navigate("/")
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.code === "PENDING_2FA_RESTART")) {
        navigate("/login")
        return
      }
      setError("Incorrect code. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            {codeType === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter one of your backup codes."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSubmitting && (
            <div role="status" aria-label="Verifying code" className="sr-only">
              Verifying…
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="code">
              {codeType === "totp" ? "Authenticator code" : "Backup code"}
            </Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={codeType === "totp" ? "000000" : ""}
              disabled={isSubmitting}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting || !code.trim()}>
            Verify
          </Button>
        </form>
        <button
          type="button"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => {
            setCode("")
            setError(null)
            setCodeType((t) => (t === "totp" ? "backup" : "totp"))
          }}
        >
          {codeType === "totp" ? "Use a backup code instead" : "Use authenticator app instead"}
        </button>
      </div>
    </div>
  )
}

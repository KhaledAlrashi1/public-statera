import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface TwoFactorSetupData {
  qr_data_uri: string
  secret_b32: string
  backup_codes: string[]
}

interface TwoFactorSetupProps {
  enabled: boolean
  setupData: TwoFactorSetupData | null
  loading: boolean
  error: string
  onSetupStart: () => Promise<void>
  onSetupConfirm: (code: string) => Promise<void>
  onDisable: (payload: { password: string; code: string }) => Promise<void>
}

export function TwoFactorSetup({
  enabled,
  setupData,
  loading,
  error,
  onSetupStart,
  onSetupConfirm,
  onDisable,
}: TwoFactorSetupProps) {
  const [confirmCode, setConfirmCode] = useState("")
  const [disablePassword, setDisablePassword] = useState("")
  const [disableCode, setDisableCode] = useState("")
  const [backupCodesSaved, setBackupCodesSaved] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState("")

  useEffect(() => {
    setBackupCodesSaved(false)
    setCopyFeedback("")
  }, [enabled, setupData])

  async function submitConfirm(e: FormEvent) {
    e.preventDefault()
    await onSetupConfirm(confirmCode)
    setConfirmCode("")
  }

  async function submitDisable(e: FormEvent) {
    e.preventDefault()
    await onDisable({ password: disablePassword, code: disableCode })
    setDisablePassword("")
    setDisableCode("")
  }

  async function copyBackupCodes() {
    if (!setupData) return
    const payload = setupData.backup_codes.join("\n")
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = payload
        textarea.setAttribute("readonly", "true")
        textarea.style.position = "absolute"
        textarea.style.left = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        textarea.remove()
      }
      setCopyFeedback("Backup codes copied.")
    } catch {
      setCopyFeedback("We couldn't copy the codes automatically. Save them manually.")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!enabled && !setupData && (
        <Button onClick={() => void onSetupStart()} loading={loading} disabled={loading}>
          {loading ? "Preparing..." : "Set up 2FA"}
        </Button>
      )}

      {!enabled && setupData && (
        <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4">
          <img
            src={setupData.qr_data_uri}
            alt="Authenticator QR code"
            className="h-48 w-48 rounded-md border border-border/60 bg-white p-2"
          />
          <div>
            <p className="text-xs text-muted-foreground">Manual setup key</p>
            <code className="text-sm">{setupData.secret_b32}</code>
          </div>
          <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
            <p className="font-semibold text-warning">Save these backup codes now.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              These codes will not be shown again. If you lose access to your authenticator app and do not have these codes, you can be locked out of your account permanently.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Backup codes (save these now)</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {setupData.backup_codes.map((code) => (
                <code key={code} className="rounded border border-border/60 px-2 py-1">
                  {code}
                </code>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyBackupCodes()}>
                Copy all codes
              </Button>
              {copyFeedback ? <p className="text-xs text-muted-foreground">{copyFeedback}</p> : null}
            </div>
          </div>
          <form onSubmit={submitConfirm} className="space-y-3">
            <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={backupCodesSaved}
                onChange={(e) => setBackupCodesSaved(e.target.checked)}
                className="mt-0.5"
              />
              <span>I have saved these backup codes somewhere safe.</span>
            </label>
            <div>
              <Label htmlFor="two-factor-confirm-code">Enter 6-digit code to confirm</Label>
              <Input
                id="two-factor-confirm-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="mt-1"
              />
            </div>
            <Button type="submit" loading={loading} disabled={loading || !backupCodesSaved || confirmCode.trim().length < 6}>
              {loading ? "Confirming..." : "Enable 2FA"}
            </Button>
          </form>
        </div>
      )}

      {enabled && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-4">
          <p className="text-sm font-medium text-foreground">2FA is enabled.</p>
          <form onSubmit={submitDisable} className="space-y-3">
            <div>
              <Label htmlFor="disable-2fa-password">Current password</Label>
              <Input
                id="disable-2fa-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="disable-2fa-code">Current 6-digit code</Label>
              <Input
                id="disable-2fa-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="mt-1"
              />
            </div>
            <Button type="submit" variant="outline" loading={loading} disabled={loading}>
              {loading ? "Disabling..." : "Disable 2FA"}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}

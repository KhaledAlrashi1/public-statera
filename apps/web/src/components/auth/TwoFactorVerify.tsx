import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type VerifyType = "totp" | "backup"

interface TwoFactorVerifyProps {
  loading: boolean
  error: string
  onVerify: (payload: { code: string; type: VerifyType }) => Promise<void>
}

export function TwoFactorVerify({ loading, error, onVerify }: TwoFactorVerifyProps) {
  const [verifyType, setVerifyType] = useState<VerifyType>("totp")
  const [code, setCode] = useState("")
  const [lastAutoSubmittedCode, setLastAutoSubmittedCode] = useState("")

  const normalizedCode = verifyType === "totp" ? code.replace(/\D/g, "").slice(0, 6) : code.trim()

  useEffect(() => {
    if (verifyType !== "totp") return
    if (normalizedCode.length !== 6) return
    if (loading) return
    if (normalizedCode === lastAutoSubmittedCode) return
    setLastAutoSubmittedCode(normalizedCode)
    void onVerify({ code: normalizedCode, type: "totp" })
  }, [lastAutoSubmittedCode, loading, normalizedCode, onVerify, verifyType])

  useEffect(() => {
    if (verifyType !== "totp" || normalizedCode.length < 6) {
      setLastAutoSubmittedCode("")
    }
  }, [normalizedCode, verifyType])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await onVerify({ code: normalizedCode, type: verifyType })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant={verifyType === "totp" ? "default" : "outline"}
          onClick={() => {
            setVerifyType("totp")
            setCode("")
            setLastAutoSubmittedCode("")
          }}
          className="flex-1"
        >
          Authenticator App
        </Button>
        <Button
          type="button"
          variant={verifyType === "backup" ? "default" : "outline"}
          onClick={() => {
            setVerifyType("backup")
            setCode("")
            setLastAutoSubmittedCode("")
          }}
          className="flex-1"
        >
          Backup Code
        </Button>
      </div>

      <div>
        <Label htmlFor="two-factor-code" className="text-sm text-muted-foreground">
          {verifyType === "totp" ? "6-digit code" : "Backup code"}
        </Label>
        <Input
          id="two-factor-code"
          value={normalizedCode}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="one-time-code"
          inputMode={verifyType === "totp" ? "numeric" : "text"}
          maxLength={verifyType === "totp" ? 6 : 20}
          placeholder={verifyType === "totp" ? "123456" : "abcd-efgh"}
          className="mt-1 bg-background/70"
        />
      </div>

      <Button type="submit" loading={loading} disabled={loading || normalizedCode.length === 0} className="w-full">
        {loading ? "Verifying..." : "Verify"}
      </Button>
    </form>
  )
}

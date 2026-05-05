import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Eye, EyeOff, ShieldCheck, Sparkles, Scale } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const { login, verifyTwoFactor } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState<"password" | "2fa">("password")
  const [notice, setNotice] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setNotice("")
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.requires2FA) {
        setStep("2fa")
        return
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleTwoFactorVerify(payload: { code: string; type: "totp" | "backup" }) {
    setError("")
    setNotice("")
    setLoading(true)
    try {
      const result = await verifyTwoFactor(payload.code, payload.type)
      if (result.warning === "BACKUP_CODES_LOW" && typeof result.backupCodesRemaining === "number") {
        setNotice(`Backup codes low: ${result.backupCodesRemaining} remaining.`)
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Two-factor verification failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 app-surface" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-stretch">
        <section className="section-panel flex-1 p-7 float-in stagger-1">
          <div className="flex items-center gap-3">
            <div className="icon-shell h-12 w-12 border-primary/20 bg-primary/10 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Statera
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Welcome back
              </h1>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Track budgets, monitor cash flow, and keep every expense aligned with your goals.
          </p>

          <div className="mt-6 space-y-3">
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Clear monthly overview</p>
                <p className="text-sm text-muted-foreground">
                  Keep income, expenses, and budget usage in one focused dashboard.
                </p>
              </div>
            </div>
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Secure by design</p>
                <p className="text-sm text-muted-foreground">
                  Your data stays protected with modern authentication workflows.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel float-in stagger-2 w-full max-w-md p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold text-muted-foreground">Sign in</p>
            <h2 className="text-2xl font-bold text-foreground">Access your account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "password" ? "Continue where you left off." : "Enter your authentication code to continue."}
            </p>
          </div>

          {step === "password" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="status-card status-card-danger">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="email" className="text-sm text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                  className="mt-1 bg-background/70"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm text-muted-foreground">
                  Password
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="bg-background/70 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-1 h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button type="submit" loading={loading} disabled={loading} className="mt-2 w-full">
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              <p className="text-center text-sm">
                <Link to="/forgot-password" className="text-primary hover:text-primary/80">
                  Forgot your password?
                </Link>
              </p>

              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/register" className="font-semibold text-primary hover:text-primary/80">
                  Create one
                </Link>
              </p>
            </form>
          ) : (
            <div className="space-y-4">
              {notice && (
                <div className="status-card status-card-warning">
                  {notice}
                </div>
              )}
              <TwoFactorVerify loading={loading} error={error} onVerify={handleTwoFactorVerify} />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep("password")
                  setError("")
                  setNotice("")
                }}
              >
                Back to password
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

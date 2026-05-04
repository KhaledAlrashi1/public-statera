import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Eye, EyeOff, ShieldCheck, Sparkles, Scale } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { markPendingWorkspaceChoice } from "@/lib/workspace-choice"

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      await register(email, password, firstName.trim() || undefined, lastName.trim() || undefined)
      markPendingWorkspaceChoice()
      navigate("/welcome", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
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
                Create your account
              </h1>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Join the workspace that unifies budgets, spend tracking, and smart guidance.
          </p>

          <div className="mt-6 space-y-3">
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Quick setup</p>
                <p className="text-sm text-muted-foreground">
                  Get started fast with simple budgeting and expense tracking.
                </p>
              </div>
            </div>
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Data you can trust</p>
                <p className="text-sm text-muted-foreground">
                  Secure authentication plus alerting on unusual activity.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel float-in stagger-2 w-full max-w-md p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold text-muted-foreground">Register</p>
            <h2 className="text-2xl font-bold text-foreground">Start tracking today</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a profile and personalize your workspace.
            </p>
          </div>

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

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName" className="text-sm text-muted-foreground">
                  First name <span className="text-muted-foreground/70">(optional)</span>
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ali"
                  autoComplete="given-name"
                  className="mt-1 bg-background/70"
                />
              </div>
              <div>
                <Label htmlFor="lastName" className="text-sm text-muted-foreground">
                  Last name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Al-Rashidi"
                  autoComplete="family-name"
                  className="mt-1 bg-background/70"
                />
              </div>
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
                  autoComplete="new-password"
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
              <p className="mt-1 text-xs text-muted-foreground">At least 8 characters</p>
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">
                Confirm password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="bg-background/70 pr-10"
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

            <Button type="submit" loading={loading} disabled={loading} className="mt-2 w-full">
              {loading ? "Creating account..." : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary hover:text-primary/80">
                Sign in
              </Link>
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}

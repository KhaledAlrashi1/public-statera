import React, { Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/components/ui/toaster"
import { AuthProvider } from "@/contexts/AuthContext"
import { PreferencesProvider } from "@/contexts/PreferencesContext"
import ProtectedRoute from "@/components/auth/ProtectedRoute"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

type ModuleLoader<T extends React.ComponentType<unknown>> = () => Promise<{ default: T }>

function isChunkImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "")
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(message)
}

function hardReloadOnce(retryKey: string): boolean {
  try {
    const key = `lazy-reload-once:${retryKey}`
    if (window.sessionStorage.getItem(key) === "1") {
      window.sessionStorage.removeItem(key)
      return false
    }
    window.sessionStorage.setItem(key, "1")
  } catch {
    // Continue with reload even if sessionStorage is unavailable.
  }
  window.location.reload()
  return true
}

function lazyWithRetry<T extends React.ComponentType<unknown>>(retryKey: string, importer: ModuleLoader<T>) {
  return React.lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      if (isChunkImportError(error) && hardReloadOnce(retryKey)) {
        // Keep suspense pending while the page reloads.
        return await new Promise<never>(() => {})
      }
      throw error
    }
  })
}

const AppShell = lazyWithRetry("app-shell", () => import("@/components/layout/AppShell"))
const DashboardPage = lazyWithRetry("dashboard", () => import("@/components/pages/DashboardPage"))
const ExpensesPage = lazyWithRetry("expenses", () => import("@/components/pages/ExpensesPage"))
const TransactionsPage = lazyWithRetry("transactions", () => import("@/components/pages/TransactionsPage"))
const IncomePage = lazyWithRetry("income", () => import("@/components/pages/IncomePage"))
const BudgetPage = lazyWithRetry("budget", () => import("@/components/pages/BudgetPage"))
const LoginPage = lazyWithRetry("login", () => import("@/components/pages/LoginPage"))
const WorkspaceChoicePage = lazyWithRetry("workspace-choice", () => import("@/components/pages/WorkspaceChoicePage"))
const ProfilePage = lazyWithRetry("profile", () => import("@/components/pages/ProfilePage"))
const InsightsPage = lazyWithRetry("insights", () => import("@/components/pages/InsightsPage"))
const NotFoundPage = lazyWithRetry("not-found", () => import("@/components/pages/NotFoundPage"))
const TwoFactorVerifyPage = lazyWithRetry("2fa-verify", () => import("@/components/pages/TwoFactorVerifyPage"))
const PrivacyPolicyPage = lazyWithRetry("privacy", () => import("@/components/pages/legal/PrivacyPolicyPage"))
const TermsPage = lazyWithRetry("terms", () => import("@/components/pages/legal/TermsPage"))
const DeleteAccountConfirmPage = lazyWithRetry("delete-account-confirm", () => import("@/components/pages/DeleteAccountConfirmPage"))

const ENABLE_PHASE2_LEGACY_REDIRECTS =
  String(import.meta.env.VITE_ENABLE_PHASE2_LEGACY_REDIRECTS ?? "").toLowerCase() === "true"

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  state = { hasError: false, error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}

function ErrorFallback({ error, onReset }: { error: unknown; onReset: () => void }) {
  const chunkError = isChunkImportError(error)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="section-panel w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-3xl">
          !
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunkError
            ? "App files were updated. Reload to get the latest version."
            : "An unexpected error occurred. You can try reloading the page."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (chunkError) {
                window.location.reload()
                return
              }
              onReset()
            }}
          >
            {chunkError ? "Reload" : "Try Again"}
          </Button>
          <Button
            type="button"
            onClick={() => window.location.assign("/")}
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        Loading page...
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/2fa-verify" element={<TwoFactorVerifyPage />} />
      {/* Standalone (post-reauth, no session) — the delete-reauth OIDC flow redirects
          here with a statera_delete_intent cookie; deliberately OUTSIDE ProtectedRoute. */}
      <Route path="/delete-account/confirm" element={<DeleteAccountConfirmPage />} />
      {/* Public (pre-auth) legal pages — reachable with no session. */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/welcome" element={<WorkspaceChoicePage />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="activity" element={<TransactionsPage />} />
          <Route path="plan" element={<BudgetPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route
            path="transactions"
            element={ENABLE_PHASE2_LEGACY_REDIRECTS ? <Navigate to="/activity?type=all" replace /> : <TransactionsPage />}
          />
          <Route
            path="expenses"
            element={ENABLE_PHASE2_LEGACY_REDIRECTS ? <Navigate to="/activity?type=expense" replace /> : <ExpensesPage />}
          />
          <Route
            path="income"
            element={ENABLE_PHASE2_LEGACY_REDIRECTS ? <Navigate to="/activity?type=income" replace /> : <IncomePage />}
          />
          <Route
            path="budget"
            element={ENABLE_PHASE2_LEGACY_REDIRECTS ? <Navigate to="/plan" replace /> : <BudgetPage />}
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}


export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PreferencesProvider>
          <ToastProvider>
            <TooltipProvider>
              <BrowserRouter>
                <ErrorBoundary>
                  <Suspense fallback={<RouteFallback />}>
                    <AppRoutes />
                  </Suspense>
                </ErrorBoundary>
              </BrowserRouter>
            </TooltipProvider>
          </ToastProvider>
        </PreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Download, LogOut } from "lucide-react"
import { analyticsApi, authApi, transactionsApi } from "@/lib/api"
import { validateOptionalTextMaxLength } from "@/lib/validation"
import { formatKD } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TwoFactorSetup, type TwoFactorSetupData } from "@/components/auth/TwoFactorSetup"
import PageHeader from "@/components/layout/PageHeader"
import { panelSection } from "@/components/ui/patterns"
import type { IncomePatternResponse } from "@/types/api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_NAME_MAX_LENGTH = 64
const DEFAULT_PROFILE_TIMEZONE = "Asia/Kuwait"
const COMMON_TIMEZONE_SUGGESTIONS = [
  "Asia/Kuwait",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Paris",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
]

function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === "string" && tz.trim() ? tz.trim() : null
  } catch {
    return null
  }
}

function buildTimezoneSuggestions(browserTimezone: string | null): string[] {
  return Array.from(
    new Set(
      [browserTimezone, ...COMMON_TIMEZONE_SUGGESTIONS]
        .filter((value): value is string => Boolean(value && value.trim()))
    )
  )
}

// ─── Inline toggle switch (no extra dependency) ──────────────────────────────
function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  )
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const { darkMode, setDarkMode } = usePreferences()
  const toast = useToast()

  // ── Account ──
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [savingName, setSavingName] = useState(false)

  // ── Email change ──
  const [emailChangeVisible, setEmailChangeVisible] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("")
  const [sendingEmailLink, setSendingEmailLink] = useState(false)

  // ── Income pattern ──
  const [incomePattern, setIncomePattern] = useState<IncomePatternResponse | null>(null)
  const [loadingIncomePattern, setLoadingIncomePattern] = useState(false)

  // ── Preferences ──
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState<boolean | null>(null)
  const [loadingProfilePreferences, setLoadingProfilePreferences] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null)
  const [savingEmailNotifications, setSavingEmailNotifications] = useState(false)
  const [timezone, setTimezone] = useState(DEFAULT_PROFILE_TIMEZONE)
  const [savedTimezone, setSavedTimezone] = useState(DEFAULT_PROFILE_TIMEZONE)
  const [savingTimezone, setSavingTimezone] = useState(false)

  // ── Security / 2FA ──
  const [currentPassword, setCurrentPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<TwoFactorSetupData | null>(null)
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [twoFactorError, setTwoFactorError] = useState("")

  // ── Account deletion ──
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false)
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState("")
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteTotpCode, setDeleteTotpCode] = useState("")
  const [deleteTotpError, setDeleteTotpError] = useState("")
  const [deleteConfirmationToken, setDeleteConfirmationToken] = useState<string | null>(null)
  const [deleteConfirmationExpiresAt, setDeleteConfirmationExpiresAt] = useState<number | null>(null)
  const [deleteSecondsRemaining, setDeleteSecondsRemaining] = useState(0)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // ── Export ──
  const [exportingFormat, setExportingFormat] = useState<null | "csv" | "xlsx">(null)
  const browserTimezone = useMemo(() => detectBrowserTimezone(), [])
  const timezoneSuggestions = useMemo(
    () => buildTimezoneSuggestions(browserTimezone),
    [browserTimezone]
  )

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadProfilePreferences = useCallback(async () => {
    if (!user) return
    setLoadingProfilePreferences(true)
    try {
      const res = await authApi.profile()
      setEmailNotificationsEnabled(res.profile?.email_notifications_enabled ?? true)
      const nextTimezone = res.profile?.timezone?.trim() || DEFAULT_PROFILE_TIMEZONE
      setTimezone(nextTimezone)
      setSavedTimezone(nextTimezone)
      setProfileLoadError(null)
    } catch {
      setEmailNotificationsEnabled(null)
      setProfileLoadError("Couldn't load profile preferences.")
      toast.error("Couldn't load profile preferences.")
    } finally {
      setLoadingProfilePreferences(false)
    }
  }, [toast, user])

  useEffect(() => {
    if (!user) return
    setFirstName(user.first_name || "")
    setLastName(user.last_name || "")
    void loadProfilePreferences()
  }, [loadProfilePreferences, user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const run = async () => {
      setLoadingIncomePattern(true)
      try {
        const data = await analyticsApi.incomePattern()
        if (!cancelled) setIncomePattern(data)
      } catch {
        if (!cancelled) setIncomePattern(null)
      } finally {
        if (!cancelled) setLoadingIncomePattern(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!deleteConfirmationToken || !deleteConfirmationExpiresAt) {
      setDeleteSecondsRemaining(0)
      return
    }

    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((deleteConfirmationExpiresAt - Date.now()) / 1000))
      setDeleteSecondsRemaining(seconds)
    }

    updateRemaining()
    const timer = window.setInterval(updateRemaining, 250)
    return () => window.clearInterval(timer)
  }, [deleteConfirmationExpiresAt, deleteConfirmationToken])

  useEffect(() => {
    if (!deleteConfirmationToken || !deleteConfirmationExpiresAt || deleteSecondsRemaining > 0) return
    setDeleteConfirmationToken(null)
    setDeleteConfirmationExpiresAt(null)
    toast.error("Deletion confirmation expired. Start again.")
  }, [deleteConfirmationExpiresAt, deleteConfirmationToken, deleteSecondsRemaining, toast])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch {
      toast.error("We couldn't sign you out right now. Please try again.")
    }
  }

  const saveName = async () => {
    if (!user) return
    const nameValidationError =
      validateOptionalTextMaxLength(firstName, "First name", PROFILE_NAME_MAX_LENGTH) ??
      validateOptionalTextMaxLength(lastName, "Last name", PROFILE_NAME_MAX_LENGTH)
    if (nameValidationError) {
      toast.error(nameValidationError.message)
      return
    }
    setSavingName(true)
    try {
      await authApi.updateProfile({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
      })
      await refreshUser()
      toast.success("Name updated.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't update your name right now."
      toast.error(msg)
    } finally {
      setSavingName(false)
    }
  }

  const requestEmailChangeLink = async () => {
    if (!user) return
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed) {
      toast.error("Enter a new email address.")
      return
    }
    if (!EMAIL_RE.test(trimmed)) {
      toast.error("Enter a valid email address.")
      return
    }
    if (trimmed === user.email.toLowerCase()) {
      toast.error("That's already your current email.")
      return
    }
    if (!currentPasswordForEmail.trim()) {
      toast.error("Current password is required.")
      return
    }
    setSendingEmailLink(true)
    try {
      await authApi.requestEmailChangeLink({ new_email: trimmed, current_password: currentPasswordForEmail })
      setNewEmail("")
      setCurrentPasswordForEmail("")
      setEmailChangeVisible(false)
      toast.success("Email change link sent. Check your inbox.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't send that email change link right now."
      toast.error(msg)
    } finally {
      setSendingEmailLink(false)
    }
  }

  const updateEmailNotificationPreference = async (enabled: boolean, previous: boolean) => {
    setSavingEmailNotifications(true)
    setEmailNotificationsEnabled(enabled)
    try {
      const res = await authApi.updateProfile({ email_notifications_enabled: enabled })
      setEmailNotificationsEnabled(res.profile?.email_notifications_enabled ?? enabled)
      toast.success(enabled ? "Email notifications enabled." : "Email notifications disabled.")
    } catch (err) {
      setEmailNotificationsEnabled(previous)
      const msg = err instanceof Error ? err.message : "We couldn't update your email notifications right now."
      toast.error(msg)
    } finally {
      setSavingEmailNotifications(false)
    }
  }

  const saveTimezonePreference = async () => {
    const trimmedTimezone = timezone.trim()
    if (!trimmedTimezone) {
      toast.error("Enter a valid IANA timezone such as Asia/Kuwait.")
      return
    }

    setSavingTimezone(true)
    try {
      const res = await authApi.updateProfile({ timezone: trimmedTimezone })
      const nextTimezone = res.profile?.timezone?.trim() || trimmedTimezone
      setTimezone(nextTimezone)
      setSavedTimezone(nextTimezone)
      toast.success(`Timezone saved as ${nextTimezone}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't update your timezone right now."
      toast.error(msg)
    } finally {
      setSavingTimezone(false)
    }
  }

  const requestPasswordChangeLink = async () => {
    setSavingPassword(true)
    try {
      await authApi.requestPasswordChangeLink({ current_password: currentPassword })
      setCurrentPassword("")
      toast.success("Password change link sent. Check your inbox or spam folder. The link expires in 30 minutes.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't send that password change link right now."
      toast.error(msg)
    } finally {
      setSavingPassword(false)
    }
  }

  const startTwoFactorSetup = async () => {
    setTwoFactorError("")
    setTwoFactorLoading(true)
    try {
      const res = await authApi.twoFactorSetup()
      setTwoFactorSetupData({
        qr_data_uri: res.qr_data_uri,
        secret_b32: res.secret_b32,
        backup_codes: res.backup_codes || [],
      })
      toast.success("2FA setup generated. Save your backup codes.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't start two-factor setup right now."
      setTwoFactorError(msg)
      toast.error(msg)
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const confirmTwoFactorSetup = async (code: string) => {
    setTwoFactorError("")
    setTwoFactorLoading(true)
    try {
      await authApi.twoFactorConfirm(code)
      setTwoFactorSetupData(null)
      await refreshUser()
      toast.success("Two-factor authentication enabled.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't confirm your two-factor code right now."
      setTwoFactorError(msg)
      toast.error(msg)
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const disableTwoFactor = async (payload: { password: string; code: string }) => {
    setTwoFactorError("")
    setTwoFactorLoading(true)
    try {
      await authApi.twoFactorDisable(payload)
      setTwoFactorSetupData(null)
      await refreshUser()
      toast.success("Two-factor authentication disabled.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't turn off two-factor authentication right now."
      setTwoFactorError(msg)
      toast.error(msg)
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const requestAccountDeletion = async () => {
    if (!user) return
    setDeleteTotpError("")
    if (deleteEmailConfirm.trim().toLowerCase() !== user.email.toLowerCase()) {
      toast.error("Type your exact account email to continue.")
      return
    }
    if (!deletePassword.trim()) {
      toast.error("Current password is required.")
      return
    }
    const normalizedTotpCode = deleteTotpCode.replace(/\D/g, "").slice(0, 6)
    if (twoFactorEnabled && normalizedTotpCode.length !== 6) {
      setDeleteTotpError("Enter your 6-digit authentication code.")
      return
    }
    setDeletingAccount(true)
    try {
      const res = await authApi.deleteAccount({
        password: deletePassword,
        totp_code: normalizedTotpCode || undefined,
      })
      const token = res.data?.confirmation_token?.trim()
      const expiresIn = Number(res.data?.expires_in ?? 30)
      if (!token) {
        toast.error("We couldn't start account deletion right now.")
        return
      }
      const safeExpiresIn = Number.isFinite(expiresIn) ? expiresIn : 30
      setDeleteConfirmationToken(token)
      setDeleteConfirmationExpiresAt(Date.now() + safeExpiresIn * 1000)
      setDeleteSecondsRemaining(safeExpiresIn)
      toast.warning(`Deletion confirmation issued. Click Delete Permanently within ${safeExpiresIn} seconds.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't start account deletion right now."
      toast.error(msg)
    } finally {
      setDeletingAccount(false)
    }
  }

  const confirmAccountDeletion = async () => {
    if (!deleteConfirmationToken) return
    setDeleteTotpError("")
    const normalizedTotpCode = deleteTotpCode.replace(/\D/g, "").slice(0, 6)
    if (twoFactorEnabled && normalizedTotpCode.length !== 6) {
      setDeleteTotpError("Enter your 6-digit authentication code.")
      return
    }
    setDeletingAccount(true)
    try {
      const res = await authApi.deleteAccount({
        password: deletePassword,
        totp_code: normalizedTotpCode || undefined,
        confirmation_token: deleteConfirmationToken,
      })
      if (res.data?.deleted) {
        await logout()
        navigate("/register", { replace: true })
        toast.success("Account deleted permanently.")
      } else {
        toast.error("We couldn't delete your account right now.")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't delete your account right now."
      if (msg.toLowerCase().includes("confirmation token")) {
        setDeleteConfirmationToken(null)
        setDeleteConfirmationExpiresAt(null)
        setDeleteSecondsRemaining(0)
      }
      toast.error(msg)
    } finally {
      setDeletingAccount(false)
    }
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    setExportingFormat(format)
    try {
      const result =
        format === "csv"
          ? await transactionsApi.exportCsv()
          : await transactionsApi.exportXlsx()
      toast.success("Your data has been downloaded.")
      if (result.truncated) {
        toast.warning(
          `Export capped at ${result.rowLimit.toLocaleString()} rows. Use date filters to export smaller ranges.`
        )
      }
    } catch {
      toast.error("Export failed. Please try again.")
    } finally {
      setExportingFormat(null)
    }
  }

  const twoFactorEnabled = Boolean(user?.totp_enabled)
  const firstNameValidation = validateOptionalTextMaxLength(firstName, "First name", PROFILE_NAME_MAX_LENGTH)
  const lastNameValidation = validateOptionalTextMaxLength(lastName, "Last name", PROFILE_NAME_MAX_LENGTH)
  const hasNameValidationError = Boolean(firstNameValidation || lastNameValidation)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader
        badge="Profile"
        badgeDotClassName="bg-primary"
        title="Account, security, and preferences"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-2 text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        }
      />

      {/* ── 1. Account ──────────────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "1", className: "p-5" })}>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your name as it appears across the app.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-first-name">First name</Label>
              <Input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ali"
                autoComplete="given-name"
                maxLength={PROFILE_NAME_MAX_LENGTH}
                aria-invalid={firstNameValidation?.tone === "error"}
                className={validationInputClass(firstNameValidation?.tone)}
              />
              <div className="flex items-start justify-between gap-3">
                <FieldFeedback tone={firstNameValidation?.tone} message={firstNameValidation?.message} />
                <p className="ml-auto text-xs text-muted-foreground">
                  {firstName.length}/{PROFILE_NAME_MAX_LENGTH}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-last-name">Last name</Label>
              <Input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Al-Rashidi"
                autoComplete="family-name"
                maxLength={PROFILE_NAME_MAX_LENGTH}
                aria-invalid={lastNameValidation?.tone === "error"}
                className={validationInputClass(lastNameValidation?.tone)}
              />
              <div className="flex items-start justify-between gap-3">
                <FieldFeedback tone={lastNameValidation?.tone} message={lastNameValidation?.message} />
                <p className="ml-auto text-xs text-muted-foreground">
                  {lastName.length}/{PROFILE_NAME_MAX_LENGTH}
                </p>
              </div>
            </div>
          </div>
          <div>
            <Button onClick={saveName} loading={savingName} disabled={savingName || hasNameValidationError}>
              {savingName ? "Saving..." : "Save name"}
            </Button>
          </div>
        </div>

        {/* Email */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Email address</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEmailChangeVisible((v) => !v)
                setNewEmail("")
                setCurrentPasswordForEmail("")
              }}
            >
              {emailChangeVisible ? "Cancel" : "Change"}
            </Button>
          </div>
          {emailChangeVisible && (
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="profile-new-email">New email address</Label>
                <Input
                  id="profile-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-email-password">Current password</Label>
                <Input
                  id="profile-email-password"
                  type="password"
                  value={currentPasswordForEmail}
                  onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                  placeholder="Your current password"
                />
              </div>
              <div>
                <Button onClick={requestEmailChangeLink} loading={sendingEmailLink} disabled={sendingEmailLink}>
                  {sendingEmailLink ? "Sending..." : "Send confirmation link"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Income ────────────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "2", className: "p-5" })}>
        <h2 className="text-lg font-semibold">Income Detection</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Review the income transactions the app is using. Planning now follows categorized income automatically.
        </p>
        {loadingIncomePattern ? (
          <div className="mt-3 skeleton h-14" />
        ) : incomePattern?.detected ? (
          <div className="inner-card mt-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detected monthly income</p>
            <p className="text-xl font-semibold leading-tight tabular-nums">
              {incomePattern.suggested_monthly_income_kd ? formatKD(incomePattern.suggested_monthly_income_kd) : "—"}
            </p>
            {incomePattern.suggested_payday_day ? (
              <p className="text-xs text-muted-foreground">
                Payday around day {incomePattern.suggested_payday_day}
                {incomePattern.suggested_payday_day >= 29 ? " (short months use the last calendar day)" : ""}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground capitalize">
              {incomePattern.confidence} confidence · {incomePattern.evidence_months} month{incomePattern.evidence_months === 1 ? "" : "s"} of data
            </p>
          </div>
        ) : (
          <div className="surface-dashed-card mt-3 p-4 text-center text-sm text-muted-foreground">
            No income detected yet. Categorize income transactions to enable automatic income tracking.
          </div>
        )}
        <div className="inner-card mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Automatic income source</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Safe to Spend, budget context, and dashboard planning use income-category transactions instead of a manual profile value.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate("/activity?type=income")}>
            Open income activity
          </Button>
        </div>
      </section>

      {/* ── 3. Security ─────────────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "3", className: "p-5" })}>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Protect your account with a strong password and two-factor authentication.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="profile-current-password">Current password</Label>
            <Input
              id="profile-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
          </div>
          <div>
            <Button onClick={requestPasswordChangeLink} loading={savingPassword} disabled={savingPassword}>
              {savingPassword ? "Sending..." : "Send password change link"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              We&apos;ll email a secure link that expires in 30 minutes. If you don&apos;t see it, check your spam folder.
            </p>
          </div>
        </div>
        <div className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold">Two-Factor Authentication</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {twoFactorEnabled
              ? "2FA is active. You can disable it using your password and current code."
              : "Add an extra layer of security with an authenticator app."}
          </p>
          <div className="mt-3">
            <TwoFactorSetup
              enabled={twoFactorEnabled}
              setupData={twoFactorSetupData}
              loading={twoFactorLoading}
              error={twoFactorError}
              onSetupStart={startTwoFactorSetup}
              onSetupConfirm={confirmTwoFactorSetup}
              onDisable={disableTwoFactor}
            />
          </div>
        </div>
      </section>

      {/* ── 5. Preferences ──────────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "5", className: "p-5" })}>
        <h2 className="text-lg font-semibold">Preferences</h2>
        <div className="mt-4 grid gap-3">
          {profileLoadError ? (
            <div className="status-card status-card-danger flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{profileLoadError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void loadProfilePreferences()
                }}
                disabled={loadingProfilePreferences}
              >
                {loadingProfilePreferences ? "Retrying..." : "Retry"}
              </Button>
            </div>
          ) : null}
          <div className="surface-row-card flex flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="pref-dark-mode" className="cursor-pointer select-none">
              Dark mode
            </Label>
            <Toggle
              id="pref-dark-mode"
              checked={darkMode}
              onChange={setDarkMode}
            />
          </div>
          <div className="surface-row-card flex flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="pref-email-notif" className="cursor-pointer select-none">
                Email notifications
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Budget alerts, consent expiry reminders, and savings milestones.
              </p>
            </div>
            <Toggle
              id="pref-email-notif"
              checked={Boolean(emailNotificationsEnabled)}
              disabled={savingEmailNotifications || loadingProfilePreferences || emailNotificationsEnabled === null}
              onChange={(v) => {
                const previous = Boolean(emailNotificationsEnabled)
                void updateEmailNotificationPreference(v, previous)
              }}
            />
          </div>
          <div className="surface-row-card px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-xl">
                  <Label htmlFor="pref-timezone" className="cursor-pointer select-none">
                    Timezone
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Save your preferred IANA timezone for future analytics localization. Time-based insights currently
                    use UTC calendar boundaries.
                  </p>
                </div>
                <div className="w-full sm:max-w-sm">
                  <Input
                    id="pref-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder={DEFAULT_PROFILE_TIMEZONE}
                    list="profile-timezone-options"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loadingProfilePreferences || savingTimezone}
                  />
                  <datalist id="profile-timezone-options">
                    {timezoneSuggestions.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {browserTimezone
                      ? `Browser detected: ${browserTimezone}. Examples: Asia/Kuwait, Europe/London, America/New_York.`
                      : "Use an IANA timezone such as Asia/Kuwait, Europe/London, or America/New_York."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (browserTimezone) setTimezone(browserTimezone)
                  }}
                  disabled={!browserTimezone || loadingProfilePreferences || savingTimezone}
                >
                  Use browser timezone
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveTimezonePreference()}
                  loading={savingTimezone}
                  disabled={loadingProfilePreferences || savingTimezone || !timezone.trim() || timezone.trim() === savedTimezone}
                >
                  {savingTimezone ? "Saving..." : "Save timezone"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Data & Privacy ───────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "6", className: "p-5" })}>
        <h2 className="text-lg font-semibold">Data & Privacy</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Export all your transactions as a flat CSV or Excel file.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => void handleExport("csv")}
            loading={exportingFormat === "csv"}
            disabled={exportingFormat !== null}
            className="flex items-center gap-2"
          >
            {exportingFormat !== "csv" ? <Download className="h-4 w-4" /> : null}
            {exportingFormat === "csv" ? "Preparing CSV…" : "Download CSV"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleExport("xlsx")}
            loading={exportingFormat === "xlsx"}
            disabled={exportingFormat !== null}
            className="flex items-center gap-2"
          >
            {exportingFormat !== "xlsx" ? <Download className="h-4 w-4" /> : null}
            {exportingFormat === "xlsx" ? "Preparing Excel…" : "Download Excel"}
          </Button>
        </div>
      </section>

      {/* ── 7. Danger Zone ──────────────────────────────────────────────── */}
      <section className={panelSection({ animated: true, stagger: "7", className: "p-5" })}>
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <div className="mt-4">
          {!dangerZoneOpen ? (
            <Button
              variant="outline"
              className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDangerZoneOpen(true)}
            >
              Delete my account
            </Button>
          ) : (
            <div className="status-card status-card-danger grid gap-3 p-4">
              <p className="text-xs font-medium text-destructive">
                This action is permanent. Type your email and password to confirm.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="delete-account-email">Type your email to confirm</Label>
                <Input
                  id="delete-account-email"
                  value={deleteEmailConfirm}
                  onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                  placeholder={user?.email || "you@example.com"}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delete-account-password">Current password</Label>
                <Input
                  id="delete-account-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Current password"
                />
              </div>
              {twoFactorEnabled && (
                <div className="grid gap-2">
                  <Label htmlFor="delete-account-totp">2FA code</Label>
                  <Input
                    id="delete-account-totp"
                    value={deleteTotpCode}
                    onChange={(e) => {
                      setDeleteTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      if (deleteTotpError) setDeleteTotpError("")
                    }}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                  />
                  {deleteTotpError ? (
                    <p className="text-xs text-destructive">{deleteTotpError}</p>
                  ) : null}
                </div>
              )}
              {deleteConfirmationToken ? (
                <p className="text-xs font-medium text-destructive">
                  Confirmation expires in {deleteSecondsRemaining}s.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!deleteConfirmationToken ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      loading={deletingAccount}
                      disabled={deletingAccount}
                      onClick={requestAccountDeletion}
                    >
                      {deletingAccount ? "Preparing..." : "Delete My Account"}
                    </Button>
                    <Button variant="outline" onClick={() => setDangerZoneOpen(false)} disabled={deletingAccount}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      loading={deletingAccount}
                      disabled={deletingAccount}
                      onClick={confirmAccountDeletion}
                    >
                      {deletingAccount ? "Deleting..." : `Delete Permanently${deleteSecondsRemaining > 0 ? ` (${deleteSecondsRemaining}s)` : ""}`}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={deletingAccount}
                      onClick={() => {
                        setDeleteConfirmationToken(null)
                        setDeleteConfirmationExpiresAt(null)
                        setDeleteSecondsRemaining(0)
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

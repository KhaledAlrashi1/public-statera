import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { User } from "@/types/api"
import { authApi, type FeatureFlags } from "@/lib/api"

interface AuthContextType {
  user: User | null
  flags: {
    enable_template_suggestions: boolean
    enable_open_banking: boolean
  }
  isLoading: boolean
  refreshUser: () => Promise<void>
  verifyTwoFactor: (
    code: string,
    type?: "totp" | "backup",
    opts?: { deleteIntent?: boolean }
  ) => Promise<{ warning?: string; backupCodesRemaining?: number }>
  logout: () => Promise<void>
  /**
   * Network-free client teardown. Used after DELETE /api/account succeeds — the
   * server has already cleared the session cookie, so calling logout() (which
   * POSTs /api/auth/logout) would be a pointless, 401-prone no-op. Clears the
   * user, feature flags, and the TanStack Query cache.
   */
  resetAuthState: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)
const defaultFlags = {
  enable_template_suggestions: false,
  enable_open_banking: false,
}

type AuthFeatureFlags = Partial<FeatureFlags> & {
  enable_template_suggestions?: boolean
  enable_open_banking?: boolean
}

function normalizeFlags(flags?: AuthFeatureFlags) {
  return {
    enable_template_suggestions: Boolean(
      flags?.template_suggestions ?? flags?.enable_template_suggestions
    ),
    enable_open_banking: Boolean(
      flags?.open_banking ?? flags?.enable_open_banking
    ),
  }
}

/**
 * Returns the best display name for a user: first_name, then the first word
 * of display_name (legacy), then the email address as a last resort.
 */
export function getUserFirstName(user: User | null): string {
  if (!user) return ""
  if (user.first_name) return user.first_name
  if (user.display_name) return user.display_name.split(" ")[0]
  return user.email
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [flags, setFlags] = useState(defaultFlags)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Check session on mount
  const refreshUser = useCallback(async () => {
    const data = await authApi.me()
    setUser(data.user ?? null)
    setFlags(normalizeFlags(data.flags))
  }, [])

  useEffect(() => {
    authApi
      .me()
      .then((data) => {
        setUser(data.user ?? null)
        setFlags(normalizeFlags(data.flags))
      })
      .catch(() => {
        setUser(null)
        setFlags(defaultFlags)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Listen for 401 events from apiFetch
  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener("auth:unauthorized", handler)
    return () => window.removeEventListener("auth:unauthorized", handler)
  }, [])

  const verifyTwoFactor = useCallback(
    async (code: string, type: "totp" | "backup" = "totp", opts?: { deleteIntent?: boolean }) => {
      const data = await authApi.twoFactorVerify({ code, type })
      // Delete-reauth 2FA issues a statera_delete_intent cookie, NOT a session —
      // refreshUser() would 401 on /me. Skip it; the confirm page needs no user.
      if (!opts?.deleteIntent) {
        await refreshUser()
      }
      return {
        warning: typeof data.warning === "string" ? data.warning : undefined,
        backupCodesRemaining:
          typeof data.backup_codes_remaining === "number" ? data.backup_codes_remaining : undefined,
      }
    },
    [refreshUser]
  )

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setFlags(defaultFlags)
    queryClient.clear()
  }, [queryClient])

  const resetAuthState = useCallback(() => {
    setUser(null)
    setFlags(defaultFlags)
    queryClient.clear()
  }, [queryClient])

  return (
    <AuthContext.Provider
      value={{ user, flags, isLoading, refreshUser, verifyTwoFactor, logout, resetAuthState }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

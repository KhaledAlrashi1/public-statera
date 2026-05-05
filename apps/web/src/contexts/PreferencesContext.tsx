import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useDarkMode as useDarkModeState } from "@/lib/useDarkMode"

interface PreferencesContextType {
  darkMode: boolean
  setDarkMode: (value: boolean) => void
  toggleDarkMode: () => void
}

const PreferencesContext = createContext<PreferencesContextType | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { isDark, setDarkMode: setDarkModeState, toggleDarkMode } = useDarkModeState()

  const setDarkMode = useCallback((value: boolean) => {
    setDarkModeState(Boolean(value))
  }, [setDarkModeState])

  const value = useMemo(
    () => ({
      darkMode: isDark,
      setDarkMode,
      toggleDarkMode,
    }),
    [
      isDark,
      setDarkMode,
      toggleDarkMode,
    ]
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider")
  return ctx
}

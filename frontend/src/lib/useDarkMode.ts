import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "theme"

function readPreference(): boolean {
  if (typeof window === "undefined") return false
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "dark") return true
  if (stored === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(readPreference)

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.classList.toggle("dark", isDark)
    try {
      window.localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light")
    } catch {
      /* ignore storage failures */
    }
  }, [isDark])

  const setDarkMode = useCallback((value: boolean) => {
    setIsDark(Boolean(value))
  }, [])

  const toggleDarkMode = useCallback(() => {
    setIsDark((prev) => !prev)
  }, [])

  return {
    isDark,
    setDarkMode,
    toggleDarkMode,
  }
}

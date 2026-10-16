// MOB-R105 F2 — on a desktop-width screen, New expense opens as a centred dialog over the page she was on,
// not as a full-screen page. Phones keep the full-screen /log, unchanged.
//
// The router remembers the last page that was not /log. At /log, on a desktop width, for a New expense (not
// /log?edit=, which stays a page), opened from inside the app (not a /log typed or reloaded: React Router's
// first location has the key "default"), the routes keep rendering that page and /log renders on top of it
// inside LogDialogContext, where LogPage's frame becomes the dialog. The entry points still call
// navigate("/log") exactly as before.
import { createContext, useEffect, useRef, useState } from "react"
import { useLocation, type Location } from "react-router-dom"

/** True inside the /log dialog (desktop width). */
export const LogDialogContext = createContext(false)

// The FAB, "L" and the desktop layout start at Tailwind's lg.
const DESKTOP_QUERY = "(min-width: 1024px)"

function readDesktop(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

/** True at desktop width (lg and up). Where matchMedia is missing (jsdom) the answer is false: the phone. */
export function useDesktopWidth(): boolean {
  const [desktop, setDesktop] = useState(readDesktop)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(DESKTOP_QUERY)
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])
  return desktop
}

/** The page to keep rendering behind the /log dialog, or null when /log is a page. */
export function useLogBackground(): Location | null {
  const location = useLocation()
  const desktop = useDesktopWidth()
  const last = useRef<Location | null>(null)
  const onLog = location.pathname === "/log"
  useEffect(() => {
    if (!onLog) last.current = location
  }, [location, onLog])
  const newExpense = !new URLSearchParams(location.search).has("edit")
  return desktop && onLog && newExpense && location.key !== "default" ? last.current : null
}

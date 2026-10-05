// MOB-R69 E3 (a) / E4 — is this a computer (a fine pointer that can hover) or a touch device?
// Computers type the amount and may focus search fields on open; touch devices keep the keypad
// and never open the keyboard on their own. Where matchMedia is missing (jsdom) the answer is
// "touch", the cautious default: no field steals focus and the keypad stays.
import { useEffect, useState } from "react"

const FINE_QUERY = "(pointer: fine) and (hover: hover)"

function readFine(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(FINE_QUERY).matches
}

/** True on a computer (pointer: fine and hover: hover); false on touch devices. */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(readFine)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(FINE_QUERY)
    const update = () => setFine(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])
  return fine
}

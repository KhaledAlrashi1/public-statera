import { useSyncExternalStore } from "react"

// MOB-R88 G2 — "Layout check": an in-memory flag (no storage), off on every launch. Profile's link turns it on;
// while on, the layout readout shows on /log and on Activity.
let on = false
const listeners = new Set<() => void>()

export function setLayoutCheck(value: boolean) {
  on = value
  for (const l of listeners) l()
}

export function useLayoutCheck(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on,
    () => false,
  )
}

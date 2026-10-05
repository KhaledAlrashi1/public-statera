// MOB-R68 C4 — money counts up from zero, once on Home's first mount and once per month change.
//
// - The animation is armed by `animateKey` (Home passes the selected month). A new key starts one
//   count-up from 0; the SAME key never starts another, so a refetch or a background refresh of
//   the same month shows the new value at once. A value that changes while its count-up is still
//   running is followed by the running count-up instead.
// - `ready` holds the start until the figures are loaded (Home's skeleton). A count-up that is
//   interrupted (ready drops, or React re-runs the effect in StrictMode) RESUMES from its original
//   start time when it can run again; it is never restarted for the same key.
// - Under prefers-reduced-motion — or where it cannot be read (no matchMedia) — the final value
//   shows at once.
// - Frames use Number for display only. The text after the last frame is exactly `format(value)`
//   for the value as given, so a 3-decimal string from the server ends as the formatter's output
//   for that exact string.
import { useLayoutEffect, useRef, useState } from "react"

import { formatKD } from "./utils"

export const COUNT_UP_DURATION_MS = 900
export const COUNT_UP_STAGGER_MS = 60

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function useCountUp({
  value,
  animateKey,
  ready = true,
  delayMs = 0,
  durationMs = COUNT_UP_DURATION_MS,
  format = formatKD,
}: {
  value: string | number
  animateKey: string
  ready?: boolean
  delayMs?: number
  durationMs?: number
  format?: (value: string | number) => string
}): { text: string; finalText: string; animating: boolean } {
  const finalText = format(value)
  const target = typeof value === "number" ? value : Number(value)
  const targetRef = useRef(Number.isFinite(target) ? target : 0)
  targetRef.current = Number.isFinite(target) ? target : 0
  const formatRef = useRef(format)
  formatRef.current = format

  const [frameText, setFrameText] = useState<string | null>(null)
  const keyRef = useRef<string | null>(null)
  const startRef = useRef(0)
  const doneRef = useRef(true)

  useLayoutEffect(() => {
    if (!ready) return
    if (keyRef.current !== animateKey) {
      keyRef.current = animateKey
      if (prefersReducedMotion()) {
        doneRef.current = true
        setFrameText(null)
        return
      }
      doneRef.current = false
      startRef.current = performance.now() + delayMs
      setFrameText(formatRef.current(0))
    }
    if (doneRef.current) return

    let raf = 0
    const tick = (now: number) => {
      const progress = Math.min(Math.max((now - startRef.current) / durationMs, 0), 1)
      if (progress >= 1) {
        doneRef.current = true
        setFrameText(null)
        return
      }
      const eased = 1 - Math.pow(1 - progress, 3)
      setFrameText(formatRef.current(targetRef.current * eased))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, animateKey, delayMs, durationMs])

  const animating = frameText !== null
  return { text: animating ? frameText : finalText, finalText, animating }
}

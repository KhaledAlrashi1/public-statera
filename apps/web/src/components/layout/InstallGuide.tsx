// MOB-R69 F4 — a one-time guide to add Statera to the Home Screen, on iPhone only, and only when
// Statera is NOT already opened from the Home Screen. Remembered per device in localStorage once
// she taps "Got it". Two variants: Safari, and Chrome on iPhone (CriOS). Other iPhone browsers see
// nothing. Strings are CHANNEL-DRAFTED and provisional (MOB-R69 F4).
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { storageKey } from "@/lib/demo/mode"

export const INSTALL_GUIDE_KEY = "statera.install-guide.seen"

type Variant = "safari" | "chrome"

function readVariant(): Variant | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null
  const ua = navigator.userAgent
  if (!/iPhone/.test(ua)) return null
  const standalone =
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return null
  try {
    if (window.localStorage.getItem(storageKey(INSTALL_GUIDE_KEY)) === "true") return null
  } catch {
    /* storage unavailable: still show it */
  }
  if (/CriOS/.test(ua)) return "chrome"
  if (/Safari/.test(ua) && !/(FxiOS|EdgiOS|OPiOS)/.test(ua)) return "safari"
  return null
}

export const WHY = "It opens full screen like an app, one tap away. No App Store needed."

const COPY: Record<Variant, string> = {
  safari: "Tap Share, then Add to Home Screen.",
  chrome: "Tap Share in the address bar, then Add to Home Screen.",
}

export function InstallGuide() {
  const [variant, setVariant] = useState<Variant | null>(readVariant)
  if (!variant) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey(INSTALL_GUIDE_KEY), "true")
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
    setVariant(null)
  }

  return (
    <section
      aria-label="Add Statera to your Home Screen"
      className="mb-4 flex items-start justify-between gap-3 rounded-[1rem] border border-border bg-card p-4 shadow-[var(--shadow-level-1)]"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">Add Statera to your Home Screen</p>
        {/* MOB-R70 E13 — why, under the title and above the steps (CHANNEL-DRAFTED, RM-26). */}
        <p className="text-sm">{WHY}</p>
        <p className="text-sm text-muted-foreground">{COPY[variant]}</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={dismiss}>
        Got it
      </Button>
    </section>
  )
}

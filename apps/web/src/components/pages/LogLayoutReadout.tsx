import { useEffect, useRef, useState } from "react"

// MOB-R86 D2 — /log?layout=1: what the phone reports about /log's size and the top safe area, for a
// screenshot. Local only, never sent anywhere. Fixed and pointer-events-none, so it adds no height to
// the page it measures and takes no taps.

type Readout = {
  innerHeight: number
  visualViewportHeight: number | null
  clientHeight: number
  scrollHeight: number | null
  insets: { top: string; right: string; bottom: string; left: string }
  standalone: boolean
  strip: { top: number; height: number; position: string; background: string } | null
}

function measure(probe: HTMLElement | null): Readout {
  const probeStyle = probe ? getComputedStyle(probe) : null
  const strip = document.querySelector<HTMLElement>('[data-testid="safe-top-strip"]')
  const stripBox = strip?.getBoundingClientRect()
  const stripStyle = strip ? getComputedStyle(strip) : null
  return {
    innerHeight: window.innerHeight,
    visualViewportHeight: window.visualViewport ? Math.round(window.visualViewport.height * 100) / 100 : null,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.scrollingElement ? document.scrollingElement.scrollHeight : null,
    insets: {
      top: probeStyle?.paddingTop || "?",
      right: probeStyle?.paddingRight || "?",
      bottom: probeStyle?.paddingBottom || "?",
      left: probeStyle?.paddingLeft || "?",
    },
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    strip:
      strip && stripBox && stripStyle
        ? { top: stripBox.top, height: stripBox.height, position: stripStyle.position, background: stripStyle.backgroundColor }
        : null,
  }
}

export function LogLayoutReadout() {
  const probe = useRef<HTMLDivElement>(null)
  const [r, setR] = useState<Readout | null>(null)

  useEffect(() => {
    const update = () => setR(measure(probe.current))
    update()
    const vv = window.visualViewport
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, { passive: true })
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    const timer = window.setInterval(update, 1000)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <div
        ref={probe}
        aria-hidden="true"
        className="pointer-events-none invisible fixed start-0 top-0 h-0 w-0"
        style={{
          paddingTop: "var(--safe-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      />
      <div
        data-testid="log-layout-readout"
        className="pointer-events-none fixed inset-x-3 top-1/2 z-[10001] -translate-y-1/2 rounded-lg border border-border bg-card/95 p-3 font-mono text-xs leading-5 text-foreground shadow-lg"
      >
        <p className="font-semibold">/log?layout=1</p>
        {r ? (
          <>
            <p>innerHeight {r.innerHeight}</p>
            <p>visualViewport.height {r.visualViewportHeight ?? "n/a"}</p>
            <p>documentElement.clientHeight {r.clientHeight}</p>
            <p>scrollingElement.scrollHeight {r.scrollHeight ?? "n/a"}</p>
            <p>{`safe-area top ${r.insets.top} · right ${r.insets.right} · bottom ${r.insets.bottom} · left ${r.insets.left}`}</p>
            <p>display-mode standalone {r.standalone ? "yes" : "no"}</p>
            <p>
              {r.strip
                ? `strip top ${r.strip.top} · height ${r.strip.height} · position ${r.strip.position} · background ${r.strip.background}`
                : "strip none"}
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

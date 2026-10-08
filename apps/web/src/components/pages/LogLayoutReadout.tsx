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
  // MOB-R88 G2 — the width side: what can be wider than her screen.
  innerWidth: number
  scrollWidth: number
  visualViewportWidth: number | null
  visualViewportScale: number | null
  scrollX: number
  overWide: string[]
  // MOB-R91 B3 — /log's scrolling frame (absent elsewhere) and what 100vh, 100dvh and 100svh measure on this phone.
  frame: { scrollHeight: number; clientHeight: number; scrollTop: number } | null
  probes: { vh: number; dvh: number; svh: number }
}

/** Up to 5 elements whose right edge is past innerWidth: tag, first two classes, left, right. Fixed elements (and
 * their children) and hidden subtrees are left out: they do not widen the page. The readout itself is left out. */
function overWideElements(): string[] {
  const limit = window.innerWidth + 0.5
  const found: Array<{ el: Element; left: number; right: number }> = []
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (el.closest('[data-layout-readout], [aria-hidden="true"]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.right <= limit) continue
    let fixed = false
    for (let a: Element | null = el; a; a = a.parentElement) {
      if (getComputedStyle(a).position === "fixed") { fixed = true; break }
    }
    if (!fixed) found.push({ el, left: r.left, right: r.right })
  }
  return found
    .sort((a, b) => b.right - a.right)
    .slice(0, 5)
    .map(({ el, left, right }) => {
      const cls = Array.from(el.classList).slice(0, 2).join(".")
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} left ${Math.round(left)} right ${Math.round(right)}`
    })
}

type HeightProbes = { vh: HTMLElement | null; dvh: HTMLElement | null; svh: HTMLElement | null }

function measure(probe: HTMLElement | null, heights: HeightProbes): Readout {
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
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    visualViewportWidth: window.visualViewport ? Math.round(window.visualViewport.width * 100) / 100 : null,
    visualViewportScale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : null,
    scrollX: window.scrollX,
    overWide: overWideElements(),
    frame: (() => {
      const f = document.querySelector<HTMLElement>("[data-log-frame]")
      return f ? { scrollHeight: f.scrollHeight, clientHeight: f.clientHeight, scrollTop: Math.round(f.scrollTop) } : null
    })(),
    probes: {
      vh: Math.round(heights.vh?.getBoundingClientRect().height ?? 0),
      dvh: Math.round(heights.dvh?.getBoundingClientRect().height ?? 0),
      svh: Math.round(heights.svh?.getBoundingClientRect().height ?? 0),
    },
  }
}

export function LogLayoutReadout() {
  const probe = useRef<HTMLDivElement>(null)
  const vhProbe = useRef<HTMLDivElement>(null)
  const dvhProbe = useRef<HTMLDivElement>(null)
  const svhProbe = useRef<HTMLDivElement>(null)
  const [r, setR] = useState<Readout | null>(null)

  useEffect(() => {
    const update = () => setR(measure(probe.current, { vh: vhProbe.current, dvh: dvhProbe.current, svh: svhProbe.current }))
    update()
    const vv = window.visualViewport
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, { passive: true })
    // MOB-R91 B3 — an element's scroll (the /log frame) does not bubble; listen in the capture phase.
    document.addEventListener("scroll", update, { capture: true, passive: true })
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    const timer = window.setInterval(update, 1000)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update)
      document.removeEventListener("scroll", update, { capture: true })
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
      {/* MOB-R91 B3 — one fixed, invisible, zero-width box per unit; its height is what the unit measures here. */}
      <div ref={vhProbe} aria-hidden="true" className="pointer-events-none invisible fixed start-0 top-0 w-0" style={{ height: "100vh" }} />
      <div ref={dvhProbe} aria-hidden="true" className="pointer-events-none invisible fixed start-0 top-0 w-0" style={{ height: "100dvh" }} />
      <div ref={svhProbe} aria-hidden="true" className="pointer-events-none invisible fixed start-0 top-0 w-0" style={{ height: "100svh" }} />
      <div
        data-testid="log-layout-readout"
        data-layout-readout=""
        className="pointer-events-none fixed inset-x-3 top-1/2 z-[10001] -translate-y-1/2 rounded-lg border border-border bg-card/95 p-3 font-mono text-xs leading-5 text-foreground shadow-lg"
      >
        <p className="font-semibold">{`Layout check · ${typeof window === "undefined" ? "" : window.location.pathname}`}</p>
        {r ? (
          <>
            <p>innerHeight {r.innerHeight}</p>
            <p>visualViewport.height {r.visualViewportHeight ?? "n/a"}</p>
            <p>documentElement.clientHeight {r.clientHeight}</p>
            <p>scrollingElement.scrollHeight {r.scrollHeight ?? "n/a"}</p>
            <p>
              {r.frame
                ? `frame scrollHeight ${r.frame.scrollHeight} · clientHeight ${r.frame.clientHeight} · scrollTop ${r.frame.scrollTop}`
                : "frame none"}
            </p>
            <p>{`100vh ${r.probes.vh} · 100dvh ${r.probes.dvh} · 100svh ${r.probes.svh}`}</p>
            <p>{`safe-area top ${r.insets.top} · right ${r.insets.right} · bottom ${r.insets.bottom} · left ${r.insets.left}`}</p>
            <p>display-mode standalone {r.standalone ? "yes" : "no"}</p>
            <p>
              {r.strip
                ? `strip top ${r.strip.top} · height ${r.strip.height} · position ${r.strip.position} · background ${r.strip.background}`
                : "strip none"}
            </p>
            <p>{`innerWidth ${r.innerWidth} · documentElement.scrollWidth ${r.scrollWidth} · scrollX ${r.scrollX}`}</p>
            <p>{`visualViewport.width ${r.visualViewportWidth ?? "n/a"} · scale ${r.visualViewportScale ?? "n/a"}`}</p>
            {r.overWide.length > 0 ? (
              r.overWide.map((line) => <p key={line}>{`wider: ${line}`}</p>)
            ) : (
              <p>wider: none</p>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}

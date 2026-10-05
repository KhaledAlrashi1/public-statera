import { useEffect, useRef, useState, type CSSProperties } from "react"

// MOB-R61 C1 — iOS Safari does not shrink dvh/vh for the on-screen keyboard; only
// window.visualViewport reports the area the user can actually see. This hook exposes that
// area as two CSS variables (--vv-top, --vv-height) for a fixed element to size itself by.
// Where visualViewport is absent (jsdom, very old browsers) it returns undefined and the
// element's own fallbacks apply.
//
// MOB-R69 D3 — `onResize` (the "reveal the focused field" step) now runs AFTER the element has
// re-rendered at the new height. Before, it ran in the same tick as the state update, so it
// scrolled against the OLD, taller box and the field could end up behind the sticky footer once
// the box shrank. The same hook serves the old sheet and every dialog on /log.

type ViewportBox = { top: number; height: number }

function readViewport(): ViewportBox | null {
  if (typeof window === "undefined" || !window.visualViewport) return null
  const vv = window.visualViewport
  return { top: vv.offsetTop, height: vv.height }
}

/**
 * Classes for a dialog that sits inside the visual viewport below 640px: top-anchored, capped to
 * the visible height, a flex column so a scroll region can sit above a fixed footer. sm+ unchanged.
 */
export const VISUAL_VIEWPORT_SHEET_CLASS =
  "max-sm:top-[calc(var(--vv-top,0px)+0.5rem)] max-sm:translate-y-0 max-sm:max-h-[calc(var(--vv-height,100dvh)-1rem)] max-sm:flex max-sm:flex-col max-sm:overflow-y-hidden"

export function useVisualViewportVars(
  active: boolean,
  onResize?: () => void,
): CSSProperties | undefined {
  const [box, setBox] = useState<ViewportBox | null>(() => (active ? readViewport() : null))
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize
  const revealPending = useRef(false)

  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport
    if (!active || !vv) return
    const update = () => setBox(readViewport())
    const resize = () => {
      revealPending.current = true
      update()
    }
    update()
    vv.addEventListener("resize", resize)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", resize)
      vv.removeEventListener("scroll", update)
    }
  }, [active])

  // Runs after the render that applied the new box, so the reveal measures the new height.
  useEffect(() => {
    if (!revealPending.current) return
    revealPending.current = false
    onResizeRef.current?.()
  }, [box])

  if (!active || !box) return undefined
  return {
    "--vv-top": `${box.top}px`,
    "--vv-height": `${box.height}px`,
  } as CSSProperties
}

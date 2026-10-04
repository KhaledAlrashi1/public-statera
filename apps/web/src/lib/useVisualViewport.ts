import { useEffect, useRef, useState, type CSSProperties } from "react"

// MOB-R61 C1 — iOS Safari does not shrink dvh/vh for the on-screen keyboard; only
// window.visualViewport reports the area the user can actually see. This hook exposes that
// area as two CSS variables (--vv-top, --vv-height) for a fixed element to size itself by.
// Where visualViewport is absent (jsdom, very old browsers) it returns undefined and the
// element's own fallbacks apply.

type ViewportBox = { top: number; height: number }

function readViewport(): ViewportBox | null {
  if (typeof window === "undefined" || !window.visualViewport) return null
  const vv = window.visualViewport
  return { top: vv.offsetTop, height: vv.height }
}

export function useVisualViewportVars(
  active: boolean,
  onResize?: () => void,
): CSSProperties | undefined {
  const [box, setBox] = useState<ViewportBox | null>(() => (active ? readViewport() : null))
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport
    if (!active || !vv) return
    const update = () => setBox(readViewport())
    const resize = () => {
      update()
      onResizeRef.current?.()
    }
    update()
    vv.addEventListener("resize", resize)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", resize)
      vv.removeEventListener("scroll", update)
    }
  }, [active])

  if (!active || !box) return undefined
  return {
    "--vv-top": `${box.top}px`,
    "--vv-height": `${box.height}px`,
  } as CSSProperties
}

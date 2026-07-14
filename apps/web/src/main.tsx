import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// Self-hosted fonts (design-5.4e) — replaces the Google Fonts <link>, so
// style-src/font-src narrow back to 'self' in the Caddyfile CSP. Weights
// match real usage: Space Grotesk (font-sans) + IBM Plex Mono (financial
// numbers) at 400/500/600/700. IBM Plex Sans stays a named fallback only
// (not self-hosted, R8). @fontsource ships per-subset woff2 with unicode-range,
// so unused subsets are never fetched. Both faces are SIL OFL 1.1.
import "@fontsource/space-grotesk/400.css"
import "@fontsource/space-grotesk/500.css"
import "@fontsource/space-grotesk/600.css"
import "@fontsource/space-grotesk/700.css"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/500.css"
import "@fontsource/ibm-plex-mono/600.css"
import "@fontsource/ibm-plex-mono/700.css"
import "./index.css"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

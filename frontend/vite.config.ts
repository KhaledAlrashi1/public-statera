import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const defaultApiProxyTarget =
  process.env.FLASK_PORT
    ? `http://127.0.0.1:${process.env.FLASK_PORT}`
    : process.env.APP_PORT
      ? `http://127.0.0.1:${process.env.APP_PORT}`
      : "http://127.0.0.1:5004"

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || defaultApiProxyTarget
const devHost = process.env.FRONTEND_DEV_HOST || "127.0.0.1"
const devPort = Number.parseInt(
  process.env.FRONTEND_DEV_PORT || process.env.VITE_DEV_PORT || "3001",
  10,
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: devHost,
    port: Number.isNaN(devPort) ? 3001 : devPort,
    strictPort: true,
    proxy: {
      // Proxy all API calls to Flask backend during development
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/transactions": {
        target: apiProxyTarget,
        changeOrigin: true,
        // Don't proxy the bare page route — let Vite serve the React SPA
        bypass(req) {
          const url = req.url || ""
          if (url === "/transactions" || url === "/transactions/") {
            return "/index.html"
          }
        },
      },
      "/categories": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/merchants": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/messages": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tooltip"],
          // Keep chart chunking automatic so deep recharts imports can split by usage.
        },
      },
    },
  },
})

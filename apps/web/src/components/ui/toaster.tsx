// ============================================================
// Global Toast / Notification System
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type ToastType = "success" | "error" | "warning" | "info"
type ToastAction = {
  label: string
  onClick: () => void
  durationMs?: number
}

interface Toast {
  id: number
  type: ToastType
  message: string
  dismissing?: boolean
  action?: ToastAction
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, action?: ToastAction) => void
  success: (message: string, action?: ToastAction) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLES: Record<ToastType, string> = {
  success: "border-success/30 bg-success/10 text-foreground",
  error: "border-destructive/30 bg-destructive/10 text-foreground",
  warning: "border-warning/35 bg-warning/10 text-foreground",
  info: "border-primary/30 bg-primary/10 text-foreground",
}

const ICON_STYLES: Record<ToastType, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: number) => void
}) {
  const Icon = ICONS[t.type]

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 shadow-[var(--shadow-level-3)] backdrop-blur-sm",
        "transition-all duration-300",
        t.dismissing ? "toast-slide-out" : "toast-slide-in",
        STYLES[t.type]
      )}
      role={t.type === "error" ? "alert" : "status"}
      aria-live={t.type === "error" ? "assertive" : "polite"}
    >
      <Icon className={cn("icon-section mt-0.5", ICON_STYLES[t.type])} />
      <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
      {t.action && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            t.action!.onClick()
            onDismiss(t.id)
          }}
          className="h-auto shrink-0 rounded-md border border-current/30 px-2 py-0.5 text-xs font-semibold opacity-80 transition hover:bg-transparent hover:opacity-100"
        >
          {t.action.label}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDismiss(t.id)}
        className="h-5 w-5 shrink-0 rounded-full p-0.5 opacity-60 transition hover:bg-transparent hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="icon-inline" />
      </Button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  )

  const dismiss = useCallback((id: number) => {
    // Start dismiss animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
    )
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 280)
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, action?: ToastAction) => {
      const id = ++nextId
      setToasts((prev) => [...prev.slice(-4), { id, type, message, action }])

      // Auto-dismiss: errors stay 10 s, toasts with action stay 6 s, everything else 4 s
      const delay = action?.durationMs ?? (type === "error" ? 10000 : action ? 6000 : 4000)
      const timer = setTimeout(() => dismiss(id), delay)
      timersRef.current.set(id, timer)
    },
    [dismiss]
  )

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (msg, action) => addToast("success", msg, action),
    error: (msg) => addToast("error", msg),
    warning: (msg) => addToast("warning", msg),
    info: (msg) => addToast("info", msg),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast container — top-right corner */}
      <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

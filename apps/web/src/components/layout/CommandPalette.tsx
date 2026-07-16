import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  User,
  Search,
  Lightbulb,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useQuickAdd } from "@/contexts/QuickAddContext"

interface CommandItem {
  id: string
  label: string
  description: string
  icon: LucideIcon
  action: () => void
  keywords: string[]
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const navigate = useNavigate()
  const { openQuickAdd } = useQuickAdd()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState(0)

  const go = useCallback(
    (path: string) => {
      onOpenChange(false)
      navigate(path)
    },
    [navigate, onOpenChange]
  )

  const quickAdd = useCallback(
    (type: "expense" | "income") => {
      onOpenChange(false)
      openQuickAdd(type)
    },
    [onOpenChange, openQuickAdd]
  )

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "home",
        label: "Home",
        description: "Monthly health and priorities",
        icon: LayoutDashboard,
        action: () => go("/"),
        keywords: ["home", "overview", "main", "kpi"],
      },
      {
        id: "activity",
        label: "Transactions",
        description: "View and manage all records",
        icon: ArrowLeftRight,
        action: () => go("/activity?type=all"),
        keywords: ["transactions", "payments", "history", "records", "activity"],
      },
      {
        id: "plan",
        label: "Plan",
        description: "Budgets, debt, and savings goals",
        icon: Wallet,
        action: () => go("/plan"),
        keywords: ["budget", "limits", "allocations", "planning", "plan", "debt", "goals"],
      },
      {
        id: "insights",
        label: "Alerts & Trends",
        description: "Spending alerts and financial patterns",
        icon: Lightbulb,
        action: () => go("/insights"),
        keywords: ["alerts", "trends", "opportunities", "insights", "analysis", "recurring", "budget"],
      },
      {
        id: "profile",
        label: "Profile",
        description: "Account & preferences",
        icon: User,
        action: () => go("/profile"),
        keywords: ["account", "settings", "password", "email", "preferences"],
      },
      {
        id: "add-expense",
        label: "Add Expense",
        description: "Capture a new expense quickly",
        icon: TrendingDown,
        action: () => quickAdd("expense"),
        keywords: ["new expense", "spending", "capture", "quick add"],
      },
      {
        id: "add-income",
        label: "Add Income",
        description: "Capture a new income entry",
        icon: TrendingUp,
        action: () => quickAdd("income"),
        keywords: ["salary", "earnings", "income", "quick add"],
      },
    ],
    [go, quickAdd]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q))
    )
  }, [commands, query])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Clamp selection
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Keyboard nav
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault()
        filtered[selected].action()
      } else if (e.key === "Escape") {
        onOpenChange(false)
      }
    },
    [filtered, selected, onOpenChange]
  )

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Palette */}
      <div className="fixed inset-x-4 top-[15vh] z-[60] mx-auto max-w-lg">
        <div className="surface-overlay overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="icon-section text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search commands"
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[320px] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              filtered.map((item, idx) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    onClick={item.action}
                    onMouseEnter={() => setSelected(idx)}
                    className={cn(
                      "h-auto w-full items-center justify-start gap-3 rounded-[var(--radius-card)] px-3 py-2.5 text-left text-sm transition-colors",
                      idx === selected
                        ? "bg-primary/12 text-primary ring-1 ring-primary/15"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="icon-inline" />
                    <div className="flex-1">
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                    {idx === selected && (
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        ↵
                      </kbd>
                    )}
                  </Button>
                )
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span>Navigate with ↑↓ arrows</span>
            <span>Press Enter to select</span>
          </div>
        </div>
      </div>
    </>
  )
}

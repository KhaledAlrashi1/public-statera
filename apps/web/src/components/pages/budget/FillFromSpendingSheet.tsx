import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { analyticsApi } from "@/lib/api"
import { formatAmountReadout, parseAmountText } from "@/lib/amount-text"
import { FILL_HISTORY_PERIODS, filsToKd, kdToFils, suggestBudgets, type FillRow } from "@/lib/budget-fill"
import { shiftKey, usePayday } from "@/lib/payday-months"
import { VISUAL_VIEWPORT_SHEET_CLASS, useVisualViewportVars } from "@/lib/useVisualViewport"
import { cn, currentMonthKeyNow } from "@/lib/utils"
import type { Category } from "@/types/api"
import { useToast } from "@/components/ui/toaster"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FieldFeedback } from "@/components/ui/field-feedback"
import { MoneyInput } from "@/components/ui/money-input"
import { findDuplicateCategory, getBudgets, saveBudgets, type BudgetData, type BudgetItem } from "./hooks"

// MOB-R98 B — "Fill from my spending". The rule is lib/budget-fill.ts; this file reads its history and shows
// the sheet. Kept out of hooks.ts and sections.tsx on purpose: five BudgetPage test files replace those two
// modules with factories that list their exports, so a new export there would be undefined in them.
// All strings are provisional (RM-26).

/** The suggestions for the selected period: [] while loading, on error, or when the rule gives no row. */
export function useFillSuggestions({
  enabled,
  budgets,
  categories,
}: {
  enabled: boolean
  budgets: BudgetItem[]
  categories: Category[]
}): FillRow[] {
  const payday = usePayday()
  // The period before today's: the history ends there (complete periods only).
  const until = useMemo(() => shiftKey(currentMonthKeyNow(), -1), [payday]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useQuery({
    // Under "dashboard-metrics", so every write that refreshes those refreshes this too.
    queryKey: ["dashboard-metrics", "budget-fill", until],
    queryFn: () => analyticsApi.dashboardMetrics({ months: FILL_HISTORY_PERIODS, until }),
    enabled,
  })
  return useMemo(() => {
    if (!enabled || !data) return []
    const periods = (data.monthly ?? []).map((m) => ({
      expenseKd: m.expense_kd,
      byCategory: data.expense_by_category?.[m.month] ?? {},
    }))
    return suggestBudgets({ periods, categories, budgeted: budgets.map((b) => b.category) })
  }, [enabled, data, categories, budgets])
}

function sumFils(amounts: string[]): number {
  return amounts.reduce((sum, a) => sum + (kdToFils(a) ?? 0), 0)
}

export function FillFromSpendingSheet({
  open,
  onOpenChange,
  month,
  rows,
  savedBudgets,
  monthlyIncomeKd,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The selected period's key: the period the budgets are written to. */
  month: string
  rows: FillRow[]
  /** The period's saved budgets, for the total. */
  savedBudgets: BudgetItem[]
  /** Her typed monthly income ("1500.000"), or null when none is set. */
  monthlyIncomeKd: string | null
  onSaved: (saved: BudgetData) => void
}) {
  const toast = useToast()
  const vvStyle = useVisualViewportVars(open)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Each box's own text, read at Add: MoneyInput hands up "" both for an empty box and for text it cannot read.
  const boxRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!open) return
    setTicked(Object.fromEntries(rows.map((r) => [r.category, true])))
    setAmounts(Object.fromEntries(rows.map((r) => [r.category, filsToKd(r.suggestionFils)])))
    setErrors({})
    setSaving(false)
    // Opened on these rows: a later refetch does not reset what she is editing.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const tickedRows = rows.filter((r) => ticked[r.category])
  const totalFils = sumFils(savedBudgets.map((b) => b.amount_kd)) + sumFils(tickedRows.map((r) => amounts[r.category] ?? ""))
  const incomeFils = kdToFils(monthlyIncomeKd) ?? 0
  const barPct = incomeFils > 0 ? Math.min(100, Math.round((totalFils * 100) / incomeFils)) : 0
  const n = tickedRows.length

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const read: BudgetItem[] = []
    const nextErrors: Record<string, string> = {}
    for (const r of tickedRows) {
      const parsed = parseAmountText(boxRefs.current[r.category]?.value ?? amounts[r.category] ?? "")
      // Refused text: the box already says why under itself. Empty: say it here. Either way the sheet stays open.
      if (parsed.kind === "empty") nextErrors[r.category] = "Enter an amount."
      if (parsed.kind !== "ok") continue
      read.push({ category: r.category, amount_kd: parsed.kd })
    }
    if (read.length !== tickedRows.length) {
      setErrors(nextErrors)
      return
    }
    setSaving(true)
    try {
      // The period's budgets, fresh from the server (not the cache): a budget set since the sheet opened stays.
      const fresh = await getBudgets(month)
      const have = new Set(fresh.items.map((b) => String(b.category || "").trim().toLowerCase()))
      const added = read.filter((b) => !have.has(b.category.trim().toLowerCase()))
      if (added.length === 0) {
        toast.info("No new budgets to add")
        onOpenChange(false)
        return
      }
      // As BudgetPage builds its list (BudgetPage.tsx:250-258): the existing rows unchanged, then the new ones.
      const next: BudgetItem[] = [...fresh.items]
      next.push(...added)
      const dup = findDuplicateCategory(next)
      if (dup) throw new Error(`Duplicate category: "${dup}". Each category can appear only once per month.`)
      const saved = await saveBudgets(month, next)
      onSaved(saved)
      toast.success(`${added.length} ${added.length === 1 ? "budget" : "budgets"} added`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't add those budgets right now")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        style={vvStyle}
        className={cn("w-[calc(100vw-1rem)] max-w-md sm:w-full", VISUAL_VIEWPORT_SHEET_CLASS)}
      >
        <DialogHeader>
          <DialogTitle>Fill from my spending</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="flex min-h-0 flex-1 flex-col gap-5 pt-4">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
            <div className="space-y-2" data-testid="fill-summary">
              <p className="text-xs text-muted-foreground">Planned total</p>
              <p className="text-2xl font-semibold tabular-nums">{formatAmountReadout(filsToKd(totalFils))}</p>
              {incomeFils > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    of {formatAmountReadout(filsToKd(incomeFils))} income
                  </p>
                  {/* One bar, total over income, in ink: colour means her places, so no category colours. */}
                  <div className="h-2 w-full rounded-full bg-muted" aria-hidden="true">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${barPct}%` }} />
                  </div>
                  <p className="text-sm tabular-nums">
                    {formatAmountReadout(filsToKd(incomeFils - totalFils))} left each month
                  </p>
                </>
              ) : null}
            </div>
            <ul className="space-y-4">
              {rows.map((r) => {
                const id = `fill-amount-${r.category.replace(/[^A-Za-z0-9]+/g, "-")}`
                return (
                  <li key={r.category} className="space-y-2 border-b border-border/50 pb-4 last:border-b-0">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={Boolean(ticked[r.category])}
                        onChange={(e) => setTicked((t) => ({ ...t, [r.category]: e.target.checked }))}
                      />
                      {r.category}
                    </label>
                    <MoneyInput
                      ref={(el) => {
                        boxRefs.current[r.category] = el
                      }}
                      id={id}
                      aria-label={`${r.category} budget`}
                      value={amounts[r.category] ?? ""}
                      onValueChange={(v) => {
                        setAmounts((a) => ({ ...a, [r.category]: v }))
                        if (errors[r.category]) setErrors((x) => ({ ...x, [r.category]: "" }))
                      }}
                      className="text-base"
                    />
                    <FieldFeedback tone={errors[r.category] ? "error" : undefined} message={errors[r.category] || undefined} />
                    <p className="text-xs text-muted-foreground">
                      You usually spend {formatAmountReadout(filsToKd(r.usualFils))}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
          <Button type="submit" loading={saving} disabled={saving || n === 0} className="min-h-11 w-full">
            {`Add ${n} ${n === 1 ? "budget" : "budgets"}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

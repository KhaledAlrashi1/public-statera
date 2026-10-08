import React, { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { authApi } from "@/lib/api"
import { parseAmountText } from "@/lib/amount-text"
import {
  MONTHLY_INCOME_INVALID_MESSAGE,
  isValidMonthlyIncome,
  useInvalidateIncomeQueries,
} from "@/lib/monthly-income"
import { VISUAL_VIEWPORT_SHEET_CLASS, useVisualViewportVars } from "@/lib/useVisualViewport"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toaster"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"

/** "1st", "2nd", "3rd", "4th" … "21st", "22nd", "23rd", "31st". */
export function paydayOrdinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13
  const suffix = teen ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"
  return `${day}${suffix}`
}

/** The payday as she sees it: the 1st reads "1st · calendar month" (no payday set means the 1st). */
export function paydayLabel(day: number | null | undefined): string {
  const d = day ?? 1
  return d === 1 ? "1st · calendar month" : paydayOrdinal(d)
}

/**
 * MOB-R91 C1 — "Income and payday": one sheet for every "Set income" entry point (Home's setup step,
 * PlanSetupPrompts and Income tile; Plan's income card) and for Profile, whose income and payday rows open it.
 *
 * Monthly income goes through the one amount normalizer (lib/amount-text, RM-27) and is optional; payday is
 * optional, days 1–31, and the 1st (or none) is the calendar month. Save sends only what she changed: an
 * unchanged field is absent from the payload, which the server leaves as it is (MOB-R46 G1); clearing an income
 * she had sends null. Below 640px the sheet sits inside the visual viewport, so Save stays above the keyboard.
 */
export function IncomeQuickDialog({
  open,
  onOpenChange,
  initialValue,
  initialPayday,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The current typed income ("1500.000"), or null when none is set. */
  initialValue?: string | null
  /** The current payday (1–31), or null when none is set (the 1st). */
  initialPayday?: number | null
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const invalidateIncomeQueries = useInvalidateIncomeQueries()
  const [value, setValue] = useState("")
  const [payday, setPayday] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const vvStyle = useVisualViewportVars(open)
  // MOB-R92 — the box's own text, read at Save. MoneyInput hands up "" both for an empty box and for text it cannot
  // read, so the value alone would turn unreadable text into "clear my income" and send null.
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "")
      setPayday(initialPayday ?? 1)
      setError(null)
      setSaving(false)
    }
  }, [open, initialValue, initialPayday])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body: { monthly_income_kd?: string | null; payday_day?: number } = {}

    const parsed = parseAmountText(amountRef.current?.value ?? value)
    const had = initialValue ?? null
    // Text it cannot read: nothing is sent; the box already says why under itself (MoneyInput's readout).
    if (parsed.kind === "refused") return
    if (parsed.kind === "empty") {
      if (had !== null) body.monthly_income_kd = null
    } else {
      if (!isValidMonthlyIncome(parsed.kd)) {
        setError(MONTHLY_INCOME_INVALID_MESSAGE)
        return
      }
      const before = had === null ? null : parseAmountText(had)
      if (!(before && before.kind === "ok" && before.kd === parsed.kd)) body.monthly_income_kd = parsed.kd
    }
    if (payday !== (initialPayday ?? 1)) body.payday_day = payday

    if (Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      await authApi.updateProfile(body)
      // A new payday moves where every month starts, so every month-keyed screen refetches; income alone
      // refreshes the screens that use it.
      if ("payday_day" in body) await queryClient.invalidateQueries()
      else await invalidateIncomeQueries()
      toast.success("payday_day" in body ? "Income and payday saved" : "Monthly income saved.")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
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
          <DialogTitle>Income and payday</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="flex min-h-0 flex-1 flex-col gap-5 pt-4">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="income-quick-amount">Monthly income</Label>
              <MoneyInput
                ref={amountRef}
                id="income-quick-amount"
                value={value}
                onValueChange={(v) => {
                  setValue(v)
                  if (error) setError(null)
                }}
                aria-invalid={error !== null}
                className={cn("text-base", validationInputClass(error ? "error" : undefined))}
              />
              <FieldFeedback tone={error ? "error" : undefined} message={error ?? undefined} />
              <p className="text-xs text-muted-foreground">If it varies, use your average month.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="income-quick-payday">Payday</Label>
              {/* 16px, so iOS does not zoom into it. */}
              <select
                id="income-quick-payday"
                value={payday}
                onChange={(e) => setPayday(Number(e.target.value))}
                className="h-11 w-full rounded-[var(--radius-control,0.75rem)] border border-input bg-background px-3 text-base"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {paydayLabel(d)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Your month starts on this day.</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">You can change these anytime in Profile.</p>
            <Button type="submit" loading={saving} disabled={saving} className="min-h-11 w-full">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

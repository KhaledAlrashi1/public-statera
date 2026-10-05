import React, { useEffect, useState } from "react"

import { authApi } from "@/lib/api"
import {
  MONTHLY_INCOME_INVALID_MESSAGE,
  isValidMonthlyIncome,
  useInvalidateIncomeQueries,
} from "@/lib/monthly-income"
import { useToast } from "@/components/ui/toaster"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"

/**
 * MOB-R46/R47 Part A — set the monthly income without leaving the page. Opened from Home's setup
 * checklist step and guided setup, Home's PlanSetupPrompts, and Plan's income card ("Set income" /
 * "Edit income", which prefills the current value).
 *
 * Sends ONLY monthly_income_kd through the same call Profile uses; the server leaves every key that
 * is absent from the payload unchanged (MOB-R46 G1). Empty or invalid input shows the error and
 * sends nothing — this dialog never sends null (clearing income stays a Profile action).
 */
export function IncomeQuickDialog({
  open,
  onOpenChange,
  initialValue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The current typed income, to prefill "Edit income". */
  initialValue?: string | null
}) {
  const toast = useToast()
  const invalidateIncomeQueries = useInvalidateIncomeQueries()
  const [value, setValue] = useState("")
  const [invalid, setInvalid] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "")
      setInvalid(false)
      setSaving(false)
    }
  }, [open, initialValue])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!isValidMonthlyIncome(trimmed)) {
      setInvalid(true)
      return
    }
    setSaving(true)
    try {
      await authApi.updateProfile({ monthly_income_kd: trimmed })
      await invalidateIncomeQueries()
      toast.success("Monthly income saved.")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Monthly income</DialogTitle>
          <DialogDescription>Your usual take-home pay. Home and Plan measure against it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="income-quick-amount">Monthly income (KD)</Label>
            <MoneyInput
              id="income-quick-amount"
              value={value}
              onValueChange={(v) => {
                setValue(v)
                if (invalid) setInvalid(false)
              }}
              aria-invalid={invalid}
              className={validationInputClass(invalid ? "error" : undefined)}
            />
            <FieldFeedback
              tone={invalid ? "error" : undefined}
              message={invalid ? MONTHLY_INCOME_INVALID_MESSAGE : undefined}
            />
            {/* MOB-R60 E2 (provisional for the design pass). */}
            <p className="text-xs text-muted-foreground">You can change this later in Profile.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving..." : "Save income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

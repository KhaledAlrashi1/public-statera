import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { validateNonNegativeAmount, validateOptionalIntegerRange } from "@/lib/validation"
import type { DebtAccount } from "@/types/api"

const MAX_DEBT_BALANCE = 999_999_999.999
const MAX_DEBT_MINIMUM = 9_999_999.999

export type DebtDialogValues = {
  name: string
  debt_type: DebtAccount["debt_type"]
  balance_kd: string
  minimum_payment_kd: string
  due_day: number | null
  apr_pct: string | null
  notes: string | null
}

const EMPTY_DEBT_FORM: DebtDialogValues = {
  name: "",
  debt_type: "other",
  balance_kd: "0.000",
  minimum_payment_kd: "0.000",
  due_day: null,
  apr_pct: null,
  notes: null,
}

function normalizeFromAccount(account: DebtAccount | null): DebtDialogValues {
  if (!account) return { ...EMPTY_DEBT_FORM }
  return {
    name: account.name || "",
    debt_type: account.debt_type || "other",
    balance_kd: account.balance_kd || "0.000",
    minimum_payment_kd: account.minimum_payment_kd || "0.000",
    due_day: account.due_day ?? null,
    apr_pct: null,
    notes: account.notes ?? null,
  }
}

export function DebtDialog({
  open,
  onOpenChange,
  account,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: DebtAccount | null
  saving: boolean
  onSubmit: (payload: DebtDialogValues) => Promise<void> | void
}) {
  const [name, setName] = useState("")
  const [debtType, setDebtType] = useState<DebtAccount["debt_type"]>("other")
  const [balance, setBalance] = useState("0.000")
  const [minimumPayment, setMinimumPayment] = useState("0.000")
  const [dueDay, setDueDay] = useState("")
  const [notes, setNotes] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [touched, setTouched] = useState({
    balance: false,
    minimumPayment: false,
    dueDay: false,
  })

  const isEdit = Boolean(account)
  const title = isEdit ? "Edit Debt" : "Add Debt"
  const description = isEdit
    ? "Update this debt account and its monthly obligation."
    : "Add a debt account so Safe-to-Spend includes minimum payments."

  const initial = useMemo(() => normalizeFromAccount(account), [account])

  useEffect(() => {
    if (!open) return
    setName(initial.name)
    setDebtType(initial.debt_type)
    setBalance(initial.balance_kd)
    setMinimumPayment(initial.minimum_payment_kd)
    setDueDay(initial.due_day === null ? "" : String(initial.due_day))
    setNotes(initial.notes ?? "")
    setFormError(null)
    setTouched({ balance: false, minimumPayment: false, dueDay: false })
  }, [open, initial])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError("Debt name is required.")
      return
    }

    const balanceCheck = validateNonNegativeAmount(balance, "Balance", { max: MAX_DEBT_BALANCE })
    if (balanceCheck?.tone === "error") {
      setTouched((prev) => ({ ...prev, balance: true }))
      setFormError(balanceCheck.message)
      return
    }

    const minimumPaymentCheck = validateNonNegativeAmount(minimumPayment, "Minimum payment", {
      max: MAX_DEBT_MINIMUM,
    })
    if (minimumPaymentCheck?.tone === "error") {
      setTouched((prev) => ({ ...prev, minimumPayment: true }))
      setFormError(minimumPaymentCheck.message)
      return
    }

    const parsedDue = dueDay.trim() === "" ? null : Number(dueDay.trim())
    if (parsedDue !== null && (!Number.isInteger(parsedDue) || parsedDue < 1 || parsedDue > 31)) {
      setFormError("Due day must be an integer between 1 and 31.")
      setTouched((prev) => ({ ...prev, dueDay: true }))
      return
    }

    setFormError(null)
    await onSubmit({
      name: trimmedName,
      debt_type: debtType,
      balance_kd: balance.trim() || "0.000",
      minimum_payment_kd: minimumPayment.trim() || "0.000",
      due_day: parsedDue,
      apr_pct: null,
      notes: notes.trim() === "" ? null : notes.trim(),
    })
  }

  const balanceValidation =
    touched.balance || Boolean(formError)
      ? validateNonNegativeAmount(balance, "Balance", { max: MAX_DEBT_BALANCE })
      : null
  const minimumPaymentValidation =
    touched.minimumPayment || Boolean(formError)
      ? validateNonNegativeAmount(minimumPayment, "Minimum payment", {
        max: MAX_DEBT_MINIMUM,
      })
      : null
  const dueDayValidation =
    touched.dueDay || Boolean(formError)
      ? validateOptionalIntegerRange(dueDay, "Due day", 1, 31)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="debt-name">Debt name</Label>
            <Input
              id="debt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Citi Card"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="debt-type">Debt type</Label>
            <select
              id="debt-type"
              value={debtType}
              onChange={(e) => setDebtType(e.target.value as DebtAccount["debt_type"])}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="credit_card">Credit card</option>
              <option value="personal_loan">Personal loan</option>
              <option value="car_loan">Car loan</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="debt-balance">Balance (KD)</Label>
              <Input
                id="debt-balance"
                type="number"
                step="0.001"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.000"
                onBlur={() => setTouched((prev) => ({ ...prev, balance: true }))}
                aria-invalid={balanceValidation?.tone === "error"}
                className={validationInputClass(balanceValidation?.tone)}
              />
              <FieldFeedback tone={balanceValidation?.tone ?? undefined} message={balanceValidation?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="debt-minimum">Minimum / month (KD)</Label>
              <Input
                id="debt-minimum"
                type="number"
                step="0.001"
                min="0"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                placeholder="0.000"
                onBlur={() => setTouched((prev) => ({ ...prev, minimumPayment: true }))}
                aria-invalid={minimumPaymentValidation?.tone === "error"}
                className={validationInputClass(minimumPaymentValidation?.tone)}
              />
              <FieldFeedback
                tone={minimumPaymentValidation?.tone ?? undefined}
                message={minimumPaymentValidation?.message}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="debt-due-day">Due day (1-31)</Label>
            <Input
              id="debt-due-day"
              type="number"
              min="1"
              max="31"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="15"
              onBlur={() => setTouched((prev) => ({ ...prev, dueDay: true }))}
              aria-invalid={dueDayValidation?.tone === "error"}
              className={validationInputClass(dueDayValidation?.tone)}
            />
            <FieldFeedback tone={dueDayValidation?.tone ?? undefined} message={dueDayValidation?.message} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="debt-notes">Notes (optional)</Label>
            <Input
              id="debt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Primary card"
            />
          </div>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Debt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

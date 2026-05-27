import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"

import { transactionsApi } from "@/lib/api"
import type { TransactionSuggestion } from "@/types/api"
import { cn, formatKD, today } from "@/lib/utils"
import {
  validatePositiveAmount,
  validateRequiredDate,
  validateRequiredText,
} from "@/lib/validation"
import { useToast } from "@/components/ui/toaster"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

type SplitTouchedField = "name" | "category" | "amount"
type SplitItem = { name: string; category: string; amount_kd: string }
export function AddExpenseDialog({
  open,
  onOpenChange,
  addForm,
  setAddForm,
  addErr,
  submitAddExpense,
  categories,
  suggestions,
  suggestOpen,
  setSuggestOpen,
  suggestLoading,
  setSuggestOpenTimeout,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  addForm: { date: string; merchant: string; category: string; name: string; amount_kd: string }
  setAddForm: (v: { date: string; merchant: string; category: string; name: string; amount_kd: string }) => void
  addErr: string | null
  submitAddExpense: () => void
  categories: string[]
  suggestions: TransactionSuggestion[]
  suggestOpen: boolean
  setSuggestOpen: (v: boolean) => void
  suggestLoading: boolean
  setSuggestOpenTimeout: () => void
}) {
  const [touched, setTouched] = useState({ date: false, amount: false })

  useEffect(() => {
    if (open) {
      setTouched({ date: false, amount: false })
    }
  }, [open])

  const dateValidation =
    touched.date || Boolean(addErr) ? validateRequiredDate(addForm.date) : null
  const amountValidation =
    touched.amount || Boolean(addErr)
      ? validatePositiveAmount(addForm.amount_kd)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full" onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !suggestOpen) {
          e.preventDefault()
          submitAddExpense()
        }
      }}>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Capture a new expense quickly. Suggestions appear as you type the transaction title.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 pt-2">
          <div className="grid gap-2">
            <Label htmlFor="add-date">Date</Label>
            <Input
              id="add-date"
              type="date"
              value={addForm.date}
              max={today()}
              onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
              aria-invalid={dateValidation?.tone === "error"}
              className={validationInputClass(dateValidation?.tone)}
            />
            <FieldFeedback tone={dateValidation?.tone} message={dateValidation?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-merchant">Merchant</Label>
            <Input
              id="add-merchant"
              placeholder="e.g., Starbucks"
              value={addForm.merchant}
              onChange={(e) => {
                setAddForm({ ...addForm, merchant: e.target.value })
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={addForm.category}
              onValueChange={(value) => {
                setAddForm({ ...addForm, category: value })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-amount">Amount (KD)</Label>
            <Input
              id="add-amount"
              type="number"
              step="0.001"
              min="0"
              value={addForm.amount_kd}
              onChange={(e) => setAddForm({ ...addForm, amount_kd: e.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, amount: true }))}
              aria-invalid={amountValidation?.tone === "error"}
              className={`money-input h-11 ${validationInputClass(amountValidation?.tone)}`}
            />
            <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-name">What was this for?</Label>
            <div className="relative">
              <Input
                id="add-name"
                placeholder="What did you buy?"
                value={addForm.name}
                onChange={(e) => {
                  const q = e.target.value
                  setAddForm({ ...addForm, name: q })
                }}
                onFocus={() => {
                  if (suggestions.length) setSuggestOpen(true)
                }}
                onBlur={setSuggestOpenTimeout}
              />
              {suggestOpen && (
                <div className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {suggestLoading ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No suggestions</div>
                  ) : (
                    suggestions.map((sug) => (
                      <Button
                        key={`${sug.name}-${sug.merchant?.name ?? ""}`}
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start justify-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setAddForm({
                            ...addForm,
                            name: sug.name,
                            category: addForm.category.trim() ? addForm.category : (sug.category?.name ?? ""),
                            merchant: sug.merchant?.name || addForm.merchant,
                          })
                          setSuggestOpen(false)
                        }}
                      >
                        <span className="font-medium">{sug.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {sug.category?.name} · {sug.merchant?.name}
                        </span>
                      </Button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          {addErr && (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {addErr}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 pt-3 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            onClick={submitAddExpense}
          >
            Add Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export function SplitTransactionDialog({
  open,
  onOpenChange,
  txnId,
  categories,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  txnId: number | null
  categories: string[]
  onSaved: () => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<SplitItem[]>([])
  const [touched, setTouched] = useState<Array<Partial<Record<SplitTouchedField, boolean>>>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [originalAmount, setOriginalAmount] = useState("")
  const [inheritedDate, setInheritedDate] = useState("")
  const [inheritedMerchant, setInheritedMerchant] = useState("")
  const [inheritedMemo, setInheritedMemo] = useState("")

  useEffect(() => {
    if (!open || !txnId) return
    let active = true
    setLoading(true)
    setError(null)
    setSubmitAttempted(false)
    setTouched([])
    transactionsApi
      .get(txnId)
      .then((res) => {
        if (!active) return
        if (!res.ok || !res.data) return
        const txn = res.data.item
        const nextItems = [
          {
            name: txn.name || "",
            category: txn.category || "Uncategorized",
            amount_kd: txn.amount_kd || "",
          },
          {
            name: "",
            category: txn.category || "Uncategorized",
            amount_kd: "",
          },
        ]
        setItems(nextItems)
        setTouched(nextItems.map(() => ({})))
        setOriginalAmount(txn.amount_kd || "")
        setInheritedDate(txn.date || "")
        setInheritedMerchant(txn.merchant || "")
        setInheritedMemo(txn.memo || "")
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : "We couldn't load this transaction right now.")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, txnId])

  const total = items.reduce((s, item) => s + Number(item.amount_kd || 0), 0)

  const updateItem = (
    idx: number,
    patch: Partial<SplitItem>
  ) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const removeItem = (idx: number) => {
    setItems((prev) => {
      const next = prev.slice()
      next.splice(idx, 1)
      return next.length ? next : [{ name: "", category: "", amount_kd: "" }]
    })
    setTouched((prev) => {
      const next = prev.slice()
      next.splice(idx, 1)
      return next.length ? next : [{}]
    })
  }

  const addItem = () => {
    setItems((prev) => [...prev, { name: "", category: "", amount_kd: "" }])
    setTouched((prev) => [...prev, {}])
  }

  const markTouched = (idx: number, field: SplitTouchedField) => {
    setTouched((prev) => {
      const next = prev.slice()
      next[idx] = {
        name: false,
        category: false,
        amount: false,
        ...next[idx],
        [field]: true,
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!txnId) return
    setError(null)
    setSubmitAttempted(true)
    const startedItems = items.filter((it) => it.name.trim() || it.category.trim() || it.amount_kd.trim())
    if (startedItems.length === 0) {
      setError("Add at least one split row with a name, category, and amount.")
      return
    }
    const invalidIndex = items.findIndex((it) => {
      const started = it.name.trim() || it.category.trim() || it.amount_kd.trim()
      return started && (
        !it.name.trim() ||
        !it.category.trim() ||
        validatePositiveAmount(it.amount_kd).tone === "error"
      )
    })
    if (invalidIndex >= 0) {
      setError(`Complete split row ${invalidIndex + 1} with a valid amount.`)
      return
    }
    if (Math.abs(total - parseFloat(originalAmount || "0")) > 0.001) {
      setError("Split amounts must sum to the original transaction total.")
      return
    }
    setSaving(true)
    try {
      await transactionsApi.split(
        txnId,
        startedItems.map((item) => ({
          name: item.name.trim(),
          category: item.category.trim(),
          amount_kd: Number(item.amount_kd).toFixed(3),
        }))
      )
      onOpenChange(false)
      onSaved()
      toast.success("Transaction split into atomic rows.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "We couldn't split this transaction right now."
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const isMultiItem = items.length > 1
  const mismatch =
    originalAmount !== "" &&
    Math.abs(total - parseFloat(originalAmount || "0")) > 0.001

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>{isMultiItem ? "Split Into Transactions" : "Split Transaction"}</DialogTitle>
          <DialogDescription>
            Replace this transaction with atomic rows that inherit the original date, merchant, and memo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="skeleton border border-border p-6 text-sm text-muted-foreground">
            Loading transaction...
          </div>
        ) : (
          <div className="grid gap-5 pt-2">
            <div className="inner-card grid gap-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Inherited date</Label>
                  <div className="text-sm font-medium">{inheritedDate || "—"}</div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Inherited merchant</Label>
                  <div className="text-sm font-medium">{inheritedMerchant || "No merchant"}</div>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Inherited memo</Label>
                <div className="text-sm text-muted-foreground">{inheritedMemo || "No memo"}</div>
              </div>
            </div>

            <div className="grid gap-4">
              {items.map((item, idx) => {
                const rowTouched = touched[idx]
                const shouldValidateOnSubmit = submitAttempted && (
                  items.length === 1 ||
                  item.name.trim() ||
                  item.category.trim() ||
                  item.amount_kd.trim()
                )
                const nameValidation =
                  rowTouched?.name || shouldValidateOnSubmit
                    ? validateRequiredText(item.name, "Transaction name")
                    : null
                const categoryValidation =
                  rowTouched?.category || shouldValidateOnSubmit
                    ? validateRequiredText(item.category, "Category")
                    : null
                const amountValidation =
                  rowTouched?.amount || shouldValidateOnSubmit
                    ? validatePositiveAmount(item.amount_kd)
                    : null

                return (
                  <div key={`split-${idx}`} className="inner-card grid gap-4 p-5">
                    <div className="grid gap-2">
                      <Label>Transaction name</Label>
                      <Input
                        value={item.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        onBlur={() => markTouched(idx, "name")}
                        placeholder="e.g. Blue-light glasses"
                        aria-invalid={nameValidation?.tone === "error"}
                        className={validationInputClass(nameValidation?.tone)}
                      />
                      <FieldFeedback tone={nameValidation?.tone} message={nameValidation?.message} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Category</Label>
                        <Select
                          value={item.category}
                          onValueChange={(value) => {
                            updateItem(idx, { category: value })
                            markTouched(idx, "category")
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-10 rounded-full px-3 text-sm shadow-sm",
                              validationInputClass(categoryValidation?.tone)
                            )}
                          >
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldFeedback tone={categoryValidation?.tone} message={categoryValidation?.message} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Amount (KD)</Label>
                        <Input
                          value={item.amount_kd}
                          onChange={(e) => updateItem(idx, { amount_kd: e.target.value })}
                          onBlur={() => markTouched(idx, "amount")}
                          placeholder="0.000"
                          aria-invalid={amountValidation?.tone === "error"}
                          className={cn("money-input h-10", validationInputClass(amountValidation?.tone))}
                        />
                        <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeItem(idx)}
                        className="h-auto items-center gap-2 px-0 text-xs font-semibold text-destructive hover:bg-transparent hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove row
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button
              type="button"
              variant="pill"
              onClick={addItem}
              size="pill"
            >
              + Add split row
            </Button>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
              <div>
                <div className="text-muted-foreground">Split total</div>
                <div className="text-xs text-muted-foreground">
                  Original total: {originalAmount ? formatKD(originalAmount) : "—"}
                </div>
              </div>
              <span className={mismatch ? "font-semibold text-destructive" : "font-semibold"}>
                {formatKD(total)}
              </span>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 pt-3 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={saving || loading}
            variant="default"
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : "Save split"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

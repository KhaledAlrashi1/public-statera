import React, {
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import {
  AlertTriangle,
  Plus,
  Scissors,
  Trash2,
  X,
} from "lucide-react"

import { transactionsApi } from "@/lib/api"
import type { TransactionSuggestion } from "@/types/api"
import { getDeletedRecordMessage } from "@/lib/error-recovery"
import { cn, formatDisplayDate, fmt3, today } from "@/lib/utils"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Separator } from "@/components/ui/separator"
import {
  applyTransactionSuggestion,
  tempId,
  useSuggestions,
} from "./helpers"
import { SuggestionCombobox } from "./suggestion-combobox"
import { CategoryCombobox } from "./category-combobox"

export function DuplicateWarningDialog({
  open,
  onOpenChange,
  meta,
  onAddAnyway,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  meta: { date: string; name: string; amount: string }
  onAddAnyway: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Possible Duplicate</DialogTitle>
          <DialogDescription>
            A similar transaction already exists.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="warning" className="flex items-start gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-xl">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div className="text-sm">
            <AlertTitle className="text-foreground">
              {formatDisplayDate(meta.date)} &middot; {meta.name} &middot; KD{" "}
              {fmt3(meta.amount)}
            </AlertTitle>
            <AlertDescription>
              This appears identical to an existing transaction. Do you want to add it anyway?
            </AlertDescription>
          </div>
        </Alert>
        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onAddAnyway}
            className="w-full sm:w-auto"
          >
            Add Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// SplitTransactionDialog
// ============================================================

type PostImportSplitEntry = {
  id: number
  name: string
  category: string
  amount_kd: string
}

export function SplitTransactionDialog({
  txnId,
  txnName,
  txnAmount,
  txnDate,
  categories,
  open,
  onOpenChange,
  onSuccess,
}: {
  txnId: number | null
  txnName: string
  txnAmount: string
  txnDate: string
  categories: string[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const catListId = useId()
  const [splits, setSplits] = useState<PostImportSplitEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSplits([
        { id: tempId(), name: txnName, category: "", amount_kd: "" },
        { id: tempId(), name: "", category: "", amount_kd: "" },
      ])
      setError(null)
      setSaving(false)
    }
  }, [open, txnName])

  const toMils = (s: string) => {
    const v = parseFloat(String(s || "").replace(/,/g, ""))
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) : 0
  }
  const originalMils = Math.round(parseFloat(String(txnAmount || "").replace(/,/g, "")) * 1000) || 0
  const allocatedMils = splits.reduce((sum, s) => sum + toMils(s.amount_kd), 0)
  const remainingMils = originalMils - allocatedMils
  const allFilled = splits.every(
    (s) => s.name.trim() && s.category.trim() && toMils(s.amount_kd) > 0
  )
  const canSave = allFilled && remainingMils === 0 && splits.length >= 2

  const updateSplit = (idx: number, field: keyof Omit<PostImportSplitEntry, "id">, value: string) => {
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  const handleConfirm = async () => {
    if (!txnId || !canSave) return
    setSaving(true)
    setError(null)
    try {
      await transactionsApi.split(
        txnId,
        splits.map((s) => ({
          name: s.name.trim(),
          category: s.category.trim(),
          amount_kd: parseFloat(s.amount_kd).toFixed(3),
        }))
      )
      onOpenChange(false)
      onSuccess()
      toast.success(`Transaction split into ${splits.length}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't split this transaction right now.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Split transaction</DialogTitle>
          <DialogDescription>
            Divide into two or more separate transactions. Each split keeps the same date and merchant.
          </DialogDescription>
        </DialogHeader>

        {/* Original transaction summary */}
        <div className="rounded-[var(--radius-card)] border border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original</p>
          <p className="mt-1 text-sm text-foreground">
            {txnName || "(no name)"} · KD {fmt3(txnAmount)} · {formatDisplayDate(txnDate)}
          </p>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          <span>Name</span>
          <span>Category</span>
          <span className="text-right">Amount (KD)</span>
          <span />
        </div>

        {/* Split rows */}
        <div className="space-y-2">
          {splits.map((split, idx) => (
            <div
              key={split.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px_32px] items-center gap-2"
            >
              <Input
                value={split.name}
                onChange={(e) => updateSplit(idx, "name", e.target.value)}
                placeholder="Name"
                className="h-9 text-base sm:text-sm"
              />
              <Input
                value={split.category}
                onChange={(e) => updateSplit(idx, "category", e.target.value)}
                placeholder="Category"
                list={catListId}
                className="h-9 text-base sm:text-sm"
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.000"
                value={split.amount_kd}
                onChange={(e) => updateSplit(idx, "amount_kd", e.target.value)}
                className="h-9 text-right text-base sm:text-sm tabular-nums"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                disabled={splits.length <= 2}
                className="h-9 w-9 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                aria-label={`Remove split ${idx + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {splits.length < 10 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSplits((prev) => [...prev, { id: tempId(), name: "", category: "", amount_kd: "" }])}
            className="h-auto w-full gap-1.5 py-2 text-sm text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Add split
          </Button>
        )}

        {/* Running total */}
        <div className="rounded-[var(--radius-card)] border border-border/40 bg-muted/10 px-4 py-2.5 text-sm">
          {remainingMils === 0 ? (
            <span className="font-medium text-success">✓ Total matches · KD {fmt3(txnAmount)}</span>
          ) : remainingMils > 0 ? (
            <span className="text-muted-foreground">
              KD {(remainingMils / 1000).toFixed(3)} of KD {fmt3(txnAmount)} unallocated
            </span>
          ) : (
            <span className="font-medium text-destructive">
              KD {(Math.abs(remainingMils) / 1000).toFixed(3)} over total
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <datalist id={catListId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <DialogFooter className="gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            loading={saving}
            disabled={!canSave || saving}
            className="w-full sm:w-auto"
          >
            {saving ? "Splitting…" : `Confirm ${splits.length} splits`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// EditTransactionDialog
// ============================================================

export function EditTransactionDialog({
  txnId,
  open,
  onOpenChange,
  categories,
  onSuccess,
  ownsSavingsCategory = false,
}: {
  txnId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: string[]
  onSuccess: () => void
  // MOB-R60 D2 — passed to the category field only (categoryOptions' one input).
  ownsSavingsCategory?: boolean
}) {
  const toast = useToast()
  const [date, setDate] = useState("")
  const [merchant, setMerchant] = useState("")
  const [memo, setMemo] = useState("")
  const [category, setCategory] = useState("")
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [touched, setTouched] = useState({ date: false })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { suggestions, fetchSuggestions } = useSuggestions()
  const [showSplit, setShowSplit] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const openDropdownCount = useRef(0)
  const trackDropdown = (dropdownOpen: boolean) => {
    openDropdownCount.current = Math.max(0, openDropdownCount.current + (dropdownOpen ? 1 : -1))
  }

  useEffect(() => {
    if (!open || !txnId) return
    setLoading(true)
    setError(null)
    setSaveAttempted(false)
    setTouched({ date: false })
    setShowSplit(false)
    transactionsApi
      .get(txnId)
      .then((res) => {
        if (!res.ok || !res.data) return
        const txn = res.data.item
        setDate(txn.date || "")
        setMerchant(txn.merchant || "")
        setMemo(txn.memo || "")
        setCategory(txn.category || "")
        setName(txn.name || "")
        setAmount(txn.amount_kd || "")
      })
      .catch((err) => {
        const deletedMessage = getDeletedRecordMessage(err, "transaction")
        if (deletedMessage) {
          setError(deletedMessage)
          toast.error(deletedMessage)
          onOpenChange(false)
          onSuccess()
          return
        }
        setError(
          err instanceof Error ? err.message : "We couldn't load this transaction right now."
        )
      })
      .finally(() => setLoading(false))
  }, [onOpenChange, onSuccess, open, toast, txnId])

  // Editing intent differs from logging: focus the name field (not amount) once loaded.
  useEffect(() => {
    if (open && !loading) requestAnimationFrame(() => nameRef.current?.focus())
  }, [open, loading])

  const dateValidation =
    touched.date || saveAttempted ? validateRequiredDate(date) : null
  const nameValidation = saveAttempted ? validateRequiredText(name, "Transaction name") : null
  const amountValidation = saveAttempted ? validatePositiveAmount(amount) : null

  const handleSave = async () => {
    setError(null)
    setSaveAttempted(true)
    const dateCheck = validateRequiredDate(date)
    if (dateCheck.tone === "error") {
      setError(dateCheck.message)
      return
    }
    const nameCheck = validateRequiredText(name, "Transaction name")
    if (nameCheck.tone === "error") {
      setError(nameCheck.message)
      return
    }
    const amountCheck = validatePositiveAmount(amount)
    if (amountCheck.tone === "error") {
      setError(amountCheck.message)
      return
    }

    setSaving(true)
    try {
      await transactionsApi.update(txnId!, {
        date,
        merchant: merchant.trim(),
        memo: memo.trim(),
        name: name.trim(),
        category: category.trim(),
        amount_kd: (parseFloat(amount) || 0).toFixed(3),
      })

      onOpenChange(false)
      onSuccess()
      toast.success("Transaction updated.")
    } catch (err) {
      const deletedMessage = getDeletedRecordMessage(err, "transaction")
      if (deletedMessage) {
        setError(deletedMessage)
        toast.error(deletedMessage)
        onOpenChange(false)
        onSuccess()
        return
      }
      const msg = err instanceof Error ? err.message : "We couldn't save those changes right now."
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    setConfirmDelete(false)
    onOpenChange(false)

    let undone = false
    const timer = setTimeout(async () => {
      if (undone) return
      try {
        await transactionsApi.delete(txnId!)
        onSuccess()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "We couldn't delete this transaction right now."
        toast.error(msg)
        onSuccess() // refresh so item reappears in table
      }
    }, 6000)

    toast.success("Transaction deleted.", {
      label: "Undo",
      onClick: () => {
        undone = true
        clearTimeout(timer)
      },
    })
  }

  const applyToForm = (s: TransactionSuggestion) =>
    applyTransactionSuggestion(s, setName, setCategory, setMerchant, merchant, category)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void handleSave()
  }

  return (
    <>
      <Dialog open={open && !confirmDelete && !showSplit} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl space-y-5 overflow-y-auto sm:w-full"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (openDropdownCount.current > 0) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Modify transaction details.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit}>
            {loading ? (
              <div className="space-y-4 py-4">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Amount hero */}
                <div className="space-y-2">
                  <Label htmlFor="edit-amount">Amount (KD)</Label>
                  <MoneyInput
                    id="edit-amount"
                    value={amount}
                    onValueChange={setAmount}
                    aria-invalid={amountValidation?.tone === "error"}
                    currencyClassName="text-base"
                    className={cn("h-14 text-xl", validationInputClass(amountValidation?.tone))}
                  />
                  <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/*
                    Suggestions match the transaction NAME, not merchant text — see
                    apps/api/src/lib/suggestions-lib.ts. Merchant suggestions are name-derived.
                  */}
                  <SuggestionCombobox
                    id="edit-merchant"
                    label="Merchant"
                    placeholder="Optional"
                    value={merchant}
                    onValueChange={setMerchant}
                    suggestions={suggestions}
                    onFetch={fetchSuggestions}
                    onSelect={applyToForm}
                    onAfterSelect={() => saveButtonRef.current?.focus()}
                    onOpenChange={trackDropdown}
                  />
                  <SuggestionCombobox
                    ref={nameRef}
                    id="edit-name"
                    label="Transaction name"
                    placeholder="What was this for?"
                    value={name}
                    onValueChange={setName}
                    suggestions={suggestions}
                    onFetch={fetchSuggestions}
                    onSelect={applyToForm}
                    onAfterSelect={() => saveButtonRef.current?.focus()}
                    onOpenChange={trackDropdown}
                    invalid={nameValidation?.tone === "error"}
                    className={validationInputClass(nameValidation?.tone)}
                    feedback={<FieldFeedback tone={nameValidation?.tone} message={nameValidation?.message} />}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CategoryCombobox
                    id="edit-category"
                    value={category}
                    onValueChange={setCategory}
                    categories={categories}
                    onOpenChange={trackDropdown}
                    ownsSavingsCategory={ownsSavingsCategory}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="edit-date">Date</Label>
                    <Input
                      id="edit-date"
                      type="date"
                      value={date}
                      max={today()}
                      onChange={(e) => setDate(e.target.value)}
                      onBlur={() => setTouched({ date: true })}
                      aria-invalid={dateValidation?.tone === "error"}
                      className={validationInputClass(dateValidation?.tone)}
                    />
                    <FieldFeedback tone={dateValidation?.tone} message={dateValidation?.message} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-memo">Memo / Notes</Label>
                  <Input
                    id="edit-memo"
                    placeholder="Additional notes about this transaction"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="mt-5 flex-col-reverse gap-2 pt-3 sm:flex-row max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-5 max-sm:-mb-5 max-sm:border-t max-sm:border-border/70 max-sm:bg-card max-sm:px-5 max-sm:pb-5">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || loading}
                className="w-full sm:mr-auto sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSplit(true)}
                disabled={saving || loading}
                className="w-full sm:w-auto"
              >
                <Scissors className="mr-2 h-4 w-4" />
                Split
              </Button>
              <Button
                ref={saveButtonRef}
                type="submit"
                variant="default"
                loading={saving}
                disabled={saving || loading}
                className="w-full sm:w-auto"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete transaction?"
        message="Delete this transaction? This cannot be undone."
        onConfirm={handleDelete}
      />

      <SplitTransactionDialog
        open={showSplit}
        onOpenChange={(v) => {
          setShowSplit(v)
        }}
        onSuccess={() => {
          setShowSplit(false)
          onOpenChange(false)
          onSuccess()
        }}
        txnId={txnId}
        txnName={name}
        txnAmount={amount}
        txnDate={date}
        categories={categories}
      />
    </>
  )
}

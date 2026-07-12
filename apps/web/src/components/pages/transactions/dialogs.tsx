import React, {
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useQuery } from "@tanstack/react-query"
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
import { cn, formatDisplayDate, formatKD, fmt3, today } from "@/lib/utils"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Separator } from "@/components/ui/separator"
import {
  applyTransactionSuggestion,
  tempId,
  useSuggestions,
} from "./helpers"
import { SuggestionCombobox } from "./suggestion-combobox"

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

export function TransactionsHero({
  kpiRange,
  onKpiRangeChange,
}: {
  kpiRange: string
  onKpiRangeChange: (v: string) => void
}) {
  const rangeKey: "30" | "90" | "365" | "all" =
    kpiRange === "90" || kpiRange === "365" || kpiRange === "all" ? kpiRange : "30"

  const {
    data: patternsResp,
    isLoading,
    isFetching,
    error: patternsError,
    refetch: refetchPatterns,
  } = useQuery({
    queryKey: ["transactions", "top-patterns", rangeKey],
    queryFn: () => transactionsApi.topPatterns(rangeKey),
  })
  const top3 = patternsResp?.items || []
  const patternsErrorMessage = patternsError instanceof Error
    ? patternsError.message
    : patternsError
      ? "We couldn't load your top transaction patterns right now."
      : null

  const rangeLabel =
    kpiRange === "all"
      ? "All time"
      : kpiRange === "365"
        ? "Last 12 months"
        : `Last ${kpiRange} days`

  return (
    <section className="float-in space-y-4" aria-label="Spending patterns">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Spending Patterns
            <span className="font-normal normal-case text-muted-foreground/80">
              &mdash; {rangeLabel}
            </span>
          </div>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Your three most-repeated transactions. Useful for spotting
            subscriptions and spending habits.
          </p>
        </div>

        <Select value={kpiRange} onValueChange={onKpiRangeChange}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24" />
            ))
          : patternsErrorMessage
            ? (
                <Alert variant="warning" className="col-span-full text-left">
                  <AlertTitle>Pattern insights unavailable</AlertTitle>
                  <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p>{patternsErrorMessage}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void refetchPatterns()
                      }}
                      loading={isFetching}
                      disabled={isFetching}
                    >
                      {isFetching ? "Retrying..." : "Retry"}
                    </Button>
                  </AlertDescription>
                </Alert>
              )
            : top3.length === 0
            ? (
                <div className="col-span-full rounded-xl border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  No activity matched this period yet.
                </div>
              )
            : top3.map((t, i) => (
                <div key={i} className="inner-card">
                  <div className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.name}
                  </div>
                  <div className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    {t.count}&times;
                  </div>
                  <div className="mt-2 text-xs font-semibold text-muted-foreground">
                    {formatKD(t.sum_kd)} total
                  </div>
                </div>
              ))}
      </div>
    </section>
  )
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  categories,
  categoriesError,
  categoriesLoading = false,
  onRetryCategories,
  onSuccess,
  initialType = "expense",
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: string[]
  categoriesError?: string | null
  categoriesLoading?: boolean
  onRetryCategories?: () => void
  onSuccess: () => void
  initialType?: "expense" | "income"
}) {
  const toast = useToast()
  const [type, setType] = useState<"expense" | "income">(initialType)
  const [date, setDate] = useState(today())
  const [merchant, setMerchant] = useState("")
  const [category, setCategory] = useState("")
  const [expenseName, setExpenseName] = useState("")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [incomeName, setIncomeName] = useState("")
  const [incomeAmount, setIncomeAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [touched, setTouched] = useState({
    date: false,
    incomeName: false,
    incomeAmount: false,
  })
  const [dupMeta, setDupMeta] = useState<{
    date: string
    name: string
    amount: string
  } | null>(null)
  const { suggestions, fetchSuggestions } = useSuggestions()
  const [keepOpen, setKeepOpen] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  // Track open suggestion panels so Escape closes the panel (not the dialog) — Radix's
  // Escape fires in the capture phase, so we gate it via onEscapeKeyDown below.
  const openDropdownCount = useRef(0)
  const trackDropdown = (dropdownOpen: boolean) => {
    openDropdownCount.current = Math.max(0, openDropdownCount.current + (dropdownOpen ? 1 : -1))
  }
  const expenseCategoriesBlocked = type === "expense" && (categoriesLoading || Boolean(categoriesError))

  const reset = (t: "expense" | "income" = initialType) => {
    setType(t)
    setDate(today())
    setMerchant("")
    setCategory("")
    setExpenseName("")
    setExpenseAmount("")
    setIncomeName("")
    setIncomeAmount("")
    setTouched({
      date: false,
      incomeName: false,
      incomeAmount: false,
    })
    setSubmitAttempted(false)
    setError(null)
    setSaving(false)
    setDupMeta(null)
    setKeepOpen(false)
  }

  // Keep-open reset: clear the entered fields but keep date + expense/income mode,
  // return validation to a pristine state, and refocus Amount for the next entry.
  const clearForNext = () => {
    setMerchant("")
    setCategory("")
    setExpenseName("")
    setExpenseAmount("")
    setIncomeName("")
    setIncomeAmount("")
    setSubmitAttempted(false)
    setTouched({ date: false, incomeName: false, incomeAmount: false })
    setError(null)
    setDupMeta(null)
    requestAnimationFrame(() => amountRef.current?.focus())
  }

  useEffect(() => {
    if (open) reset(initialType)
  }, [open, initialType])

  const dateValidation =
    touched.date || submitAttempted ? validateRequiredDate(date) : null
  const incomeNameValidation =
    touched.incomeName || submitAttempted
      ? validateRequiredText(incomeName, "Income name")
      : null
  const incomeAmountValidation =
    touched.incomeAmount || submitAttempted
      ? validatePositiveAmount(incomeAmount)
      : null
  const expenseNameValidation =
    submitAttempted && type === "expense"
      ? validateRequiredText(expenseName, "Expense name")
      : null
  const expenseAmountValidation =
    submitAttempted && type === "expense"
      ? validatePositiveAmount(expenseAmount)
      : null

  const handleIncomeSubmit = async () => {
    setError(null)
    setSubmitAttempted(true)
    const dateCheck = validateRequiredDate(date)
    if (dateCheck.tone === "error") { setError(dateCheck.message); return }
    const nameCheck = validateRequiredText(incomeName, "Income name")
    if (nameCheck.tone === "error") { setError(nameCheck.message); return }
    const amountCheck = validatePositiveAmount(incomeAmount)
    if (amountCheck.tone === "error") {
      setError(amountCheck.message)
      return
    }
    const amount = parseFloat(incomeAmount)
    setSaving(true)
    try {
      await transactionsApi.create({
        date,
        category: "Income",
        name: incomeName.trim(),
        amount_kd: amount.toFixed(3),
      })
      onSuccess()
      toast.success("Income added successfully.")
      if (keepOpen) clearForNext()
      else onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't add that income entry right now."
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (force = false) => {
    setError(null)
    setSubmitAttempted(true)

    const dateCheck = validateRequiredDate(date)
    if (dateCheck.tone === "error") {
      setError(dateCheck.message)
      return
    }
    const nameCheck = validateRequiredText(expenseName, "Expense name")
    if (nameCheck.tone === "error") {
      setError(nameCheck.message)
      return
    }
    const amountCheck = validatePositiveAmount(expenseAmount)
    if (amountCheck.tone === "error") {
      setError(amountCheck.message)
      return
    }
    const total = parseFloat(expenseAmount)
    if (total <= 0) {
      setError("Total amount must be greater than zero.")
      return
    }

    setSaving(true)

    try {
      if (!force) {
        try {
          const dup = await transactionsApi.dupCheck(
            date,
            expenseName.trim(),
            total.toFixed(3)
          )
          if (dup.count > 0) {
            setDupMeta({
              date,
              name: expenseName.trim(),
              amount: total.toFixed(3),
            })
            setSaving(false)
            return
          }
        } catch {
          /* proceed on dup-check failure */
        }
      }

      await transactionsApi.create({
        date,
        merchant: merchant.trim() || undefined,
        category: category.trim(),
        name: expenseName.trim(),
        amount_kd: total.toFixed(3),
        force: force ? "1" : undefined,
      })

      onSuccess()
      toast.success("Transaction added successfully.")
      if (keepOpen) clearForNext()
      else onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't add that transaction right now."
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (type === "income") void handleIncomeSubmit()
    else void handleSubmit(false)
  }

  const applyToForm = (s: TransactionSuggestion) =>
    applyTransactionSuggestion(s, setExpenseName, setCategory, setMerchant, merchant, category)

  return (
    <>
      <Dialog open={open && !dupMeta} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl space-y-5 overflow-y-auto sm:w-full"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            requestAnimationFrame(() => amountRef.current?.focus())
          }}
          onEscapeKeyDown={(e) => {
            if (openDropdownCount.current > 0) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {type === "income" ? "Add Income" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>

          {/* Type toggle */}
          <div className="grid grid-cols-2 rounded-lg border border-border/70 p-0.5 text-sm">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setType("expense")
                setSubmitAttempted(false)
                setError(null)
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 font-medium transition",
                type === "expense"
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-transparent hover:text-foreground"
              )}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setType("income")
                setSubmitAttempted(false)
                setError(null)
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 font-medium transition",
                type === "income"
                  ? "bg-success text-success-foreground shadow-sm hover:bg-success hover:text-success-foreground"
                  : "text-muted-foreground hover:bg-transparent hover:text-foreground"
              )}
            >
              Income
            </Button>
          </div>

          <form onSubmit={onSubmit}>
            <div className="space-y-5">
              {type === "income" ? (
                <div className="space-y-5">
                  {/* Amount hero */}
                  <div className="space-y-2">
                    <Label htmlFor="income-amount">Amount (KD)</Label>
                    <MoneyInput
                      ref={amountRef}
                      id="income-amount"
                      value={incomeAmount}
                      onValueChange={setIncomeAmount}
                      onBlur={() => setTouched((prev) => ({ ...prev, incomeAmount: true }))}
                      aria-invalid={incomeAmountValidation?.tone === "error"}
                      currencyClassName="text-base"
                      className={cn("h-14 text-xl", validationInputClass(incomeAmountValidation?.tone))}
                    />
                    <FieldFeedback tone={incomeAmountValidation?.tone} message={incomeAmountValidation?.message} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="income-name">Name</Label>
                      <Input
                        id="income-name"
                        placeholder="e.g., Salary"
                        value={incomeName}
                        onChange={(e) => setIncomeName(e.target.value)}
                        onBlur={() => setTouched((prev) => ({ ...prev, incomeName: true }))}
                        aria-invalid={incomeNameValidation?.tone === "error"}
                        className={validationInputClass(incomeNameValidation?.tone)}
                      />
                      <FieldFeedback tone={incomeNameValidation?.tone} message={incomeNameValidation?.message} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="income-date">Date</Label>
                      <Input
                        id="income-date"
                        type="date"
                        value={date}
                        max={today()}
                        onChange={(e) => setDate(e.target.value)}
                        onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                        aria-invalid={dateValidation?.tone === "error"}
                        className={validationInputClass(dateValidation?.tone)}
                      />
                      <FieldFeedback tone={dateValidation?.tone} message={dateValidation?.message} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {categoriesLoading ? (
                    <Alert variant="warning">
                      <AlertTitle>Loading categories</AlertTitle>
                      <AlertDescription>
                        Categories are still loading for quick add. Wait a moment before saving this expense.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {categoriesError ? (
                    <Alert variant="warning">
                      <AlertTitle>Categories unavailable</AlertTitle>
                      <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p>{categoriesError}</p>
                        {onRetryCategories ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onRetryCategories}
                          >
                            Retry categories
                          </Button>
                        ) : null}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {/* Amount hero */}
                  <div className="space-y-2">
                    <Label htmlFor="expense-amount">Amount (KD)</Label>
                    <MoneyInput
                      ref={amountRef}
                      id="expense-amount"
                      value={expenseAmount}
                      onValueChange={setExpenseAmount}
                      aria-invalid={expenseAmountValidation?.tone === "error"}
                      currencyClassName="text-base"
                      className={cn("h-14 text-xl", validationInputClass(expenseAmountValidation?.tone))}
                    />
                    <FieldFeedback tone={expenseAmountValidation?.tone} message={expenseAmountValidation?.message} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/*
                      The suggestions backend matches q against the transaction NAME
                      (memorized norm/canonical), NOT merchant text — see
                      apps/api/src/lib/suggestions-lib.ts. Merchant-field suggestions are
                      therefore name-derived: typing "netf" surfaces the row named
                      "Netflix subscription". Do not assume merchant-text matching here.
                    */}
                    <SuggestionCombobox
                      id="add-merchant"
                      label="Merchant"
                      placeholder="e.g., Starbucks"
                      value={merchant}
                      onValueChange={setMerchant}
                      suggestions={suggestions}
                      onFetch={fetchSuggestions}
                      onSelect={applyToForm}
                      onAfterSelect={() => saveButtonRef.current?.focus()}
                      onOpenChange={trackDropdown}
                    />
                    <SuggestionCombobox
                      id="expense-name"
                      label="What was this for?"
                      placeholder="What did you buy?"
                      value={expenseName}
                      onValueChange={setExpenseName}
                      suggestions={suggestions}
                      onFetch={fetchSuggestions}
                      onSelect={applyToForm}
                      onAfterSelect={() => saveButtonRef.current?.focus()}
                      onOpenChange={trackDropdown}
                      invalid={expenseNameValidation?.tone === "error"}
                      className={validationInputClass(expenseNameValidation?.tone)}
                      feedback={<FieldFeedback tone={expenseNameValidation?.tone} message={expenseNameValidation?.message} />}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((entry) => (
                            <SelectItem key={entry} value={entry}>
                              {entry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-date">Date</Label>
                      <Input
                        id="add-date"
                        type="date"
                        value={date}
                        max={today()}
                        onChange={(e) => setDate(e.target.value)}
                        onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                        aria-invalid={dateValidation?.tone === "error"}
                        className={validationInputClass(dateValidation?.tone)}
                      />
                      <FieldFeedback tone={dateValidation?.tone} message={dateValidation?.message} />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="mt-5 flex-col-reverse gap-2 pt-3 sm:flex-row sm:items-center">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground sm:mr-auto">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
                Keep open for another
              </label>
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
                ref={saveButtonRef}
                type="submit"
                variant="default"
                loading={saving}
                disabled={saving || expenseCategoriesBlocked}
                className={cn(
                  "w-full sm:w-auto",
                  type === "income"
                    ? "bg-success text-white hover:bg-success"
                    : ""
                )}
              >
                {saving ? "Adding..." : type === "income" ? "Add Income" : "Add Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {dupMeta && (
        <DuplicateWarningDialog
          open={!!dupMeta}
          onOpenChange={(v) => {
            if (!v) setDupMeta(null)
          }}
          meta={dupMeta}
          onAddAnyway={() => {
            setDupMeta(null)
            handleSubmit(true)
          }}
        />
      )}
    </>
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
                className="h-9 text-sm"
              />
              <Input
                value={split.category}
                onChange={(e) => updateSplit(idx, "category", e.target.value)}
                placeholder="Category"
                list={catListId}
                className="h-9 text-sm"
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.000"
                value={split.amount_kd}
                onChange={(e) => updateSplit(idx, "amount_kd", e.target.value)}
                className="h-9 text-right text-sm tabular-nums"
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
}: {
  txnId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: string[]
  onSuccess: () => void
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
          className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl space-y-5 overflow-y-auto sm:w-full"
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
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((entry) => (
                          <SelectItem key={entry} value={entry}>
                            {entry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

            <DialogFooter className="mt-5 flex-col-reverse gap-2 pt-3 sm:flex-row">
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

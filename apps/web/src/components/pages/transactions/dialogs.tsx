import React, {
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  CreditCard,
  Plus,
  Scissors,
  Trash2,
  X,
} from "lucide-react"

import { transactionsApi } from "@/lib/api"
import { getDeletedRecordMessage } from "@/lib/error-recovery"
import { cn, formatKD, fmt3, today } from "@/lib/utils"
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
              {meta.date} &middot; {meta.name} &middot; KD{" "}
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
    <section className="page-hero hero-sheen brand-gradient float-in gradient-flow">
      <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary-foreground/10 blur-2xl" />
      <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl" />

      <div className="relative z-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground/80">
              Spending Patterns
              <span className="font-normal opacity-80">
                &mdash; {rangeLabel}
              </span>
            </div>
            <p className="mt-1 max-w-md text-sm text-primary-foreground/70">
              Your three most-repeated transactions. Useful for spotting
              subscriptions and spending habits.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Select value={kpiRange} onValueChange={onKpiRangeChange}>
              <SelectTrigger className="h-9 w-[150px] border-primary-foreground/20 bg-primary-foreground/10 text-sm text-primary-foreground [&>svg]:text-primary-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            <div className="hero-icon-shell h-10 w-10 text-lg sm:h-12 sm:w-12">
              <CreditCard className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-xl bg-primary-foreground/10"
                />
              ))
            : patternsErrorMessage
              ? (
                  <Alert variant="warning" className="col-span-full border-warning/35 bg-warning/10 text-left">
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
                  <div className="col-span-full rounded-xl bg-primary-foreground/10 p-4 text-center text-sm text-primary-foreground/70">
                    No activity matched this period yet.
                  </div>
                )
              : top3.map((t, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/12 p-4 backdrop-blur-sm transition-all hover:bg-primary-foreground/18"
                  >
                    <div className="truncate text-xs font-bold uppercase tracking-wider opacity-90">
                      {t.name}
                    </div>
                    <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
                      {t.count}&times;
                    </div>
                    <div className="mt-2 text-xs font-semibold opacity-85">
                      {formatKD(t.sum_kd)} total
                    </div>
                  </div>
                ))}
        </div>
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
  const { suggestions, fetchSuggestions, lookup } = useSuggestions()
  const [suggestOpen, setSuggestOpen] = useState(false)
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
    setSuggestOpen(false)
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
      onOpenChange(false)
      onSuccess()
      toast.success("Income added successfully.")
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

      onOpenChange(false)
      onSuccess()
      toast.success("Transaction added successfully.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't add that transaction right now."
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open && !dupMeta} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl space-y-5 overflow-y-auto sm:w-full">
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

          <div className="space-y-5">
            {type === "income" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="income-amount">Amount (KD)</Label>
                  <Input
                    id="income-amount"
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.000"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, incomeAmount: true }))}
                    aria-invalid={incomeAmountValidation?.tone === "error"}
                    className={cn("money-input h-11", validationInputClass(incomeAmountValidation?.tone))}
                  />
                  <FieldFeedback tone={incomeAmountValidation?.tone} message={incomeAmountValidation?.message} />
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
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <div className="space-y-2">
                    <Label htmlFor="add-merchant">Merchant</Label>
                    <Input
                      id="add-merchant"
                      placeholder="e.g., Starbucks"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                    />
                  </div>
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
                    <Label htmlFor="expense-amount">Amount (KD)</Label>
                    <Input
                      id="expense-amount"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0.000"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      aria-invalid={expenseAmountValidation?.tone === "error"}
                      className={cn("money-input h-11", validationInputClass(expenseAmountValidation?.tone))}
                    />
                    <FieldFeedback tone={expenseAmountValidation?.tone} message={expenseAmountValidation?.message} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-name">What was this for?</Label>
                  <div className="relative">
                    <Input
                      id="expense-name"
                      placeholder="What did you buy?"
                      value={expenseName}
                      onChange={(e) => {
                        const next = e.target.value
                        setExpenseName(next)
                        if (next.length >= 2) {
                          fetchSuggestions(next)
                          setSuggestOpen(true)
                        } else {
                          setSuggestOpen(false)
                        }
                      }}
                      onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                      onFocus={() => {
                        if (suggestions.length) setSuggestOpen(true)
                      }}
                      aria-invalid={expenseNameValidation?.tone === "error"}
                      className={validationInputClass(expenseNameValidation?.tone)}
                    />
                    <FieldFeedback tone={expenseNameValidation?.tone} message={expenseNameValidation?.message} />
                    {suggestOpen ? (
                      <div className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                        {suggestions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No suggestions</div>
                        ) : (
                          suggestions.map((suggestion) => (
                            <Button
                              key={`${suggestion.name}-${suggestion.merchant?.name ?? ""}`}
                              type="button"
                              variant="ghost"
                              className="h-auto w-full flex-col items-start justify-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                applyTransactionSuggestion(suggestion, setExpenseName, setCategory, setMerchant, merchant, category)
                                setSuggestOpen(false)
                              }}
                            >
                              <span className="font-medium">{suggestion.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {suggestion.category?.name} · {suggestion.merchant?.name}
                              </span>
                            </Button>
                          ))
                        )}
                      </div>
                    ) : null}
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

          <DialogFooter className="flex-col-reverse gap-2 pt-3 sm:flex-row">
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
              onClick={() => type === "income" ? handleIncomeSubmit() : handleSubmit(false)}
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
            {txnName || "(no name)"} · KD {fmt3(txnAmount)} · {txnDate}
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
  const { suggestions, fetchSuggestions, lookup } = useSuggestions()
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [showSplit, setShowSplit] = useState(false)

  useEffect(() => {
    if (!open || !txnId) return
    setLoading(true)
    setError(null)
    setSaveAttempted(false)
    setTouched({ date: false })
    setSuggestOpen(false)
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

  return (
    <>
      <Dialog open={open && !confirmDelete && !showSplit} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl space-y-5 overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Modify transaction details.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4 py-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
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
                <div className="space-y-2">
                  <Label>Merchant</Label>
                  <Input
                    placeholder="Optional"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                  />
                </div>
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
                  <Label>Amount (KD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={amountValidation?.tone === "error"}
                    className={cn("money-input h-11", validationInputClass(amountValidation?.tone))}
                  />
                  <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Transaction name</Label>
                <div className="relative">
                  <Input
                    placeholder="What was this for?"
                    value={name}
                    onChange={(e) => {
                      const next = e.target.value
                      setName(next)
                      if (next.length >= 2) {
                        fetchSuggestions(next)
                        setSuggestOpen(true)
                      } else {
                        setSuggestOpen(false)
                      }
                    }}
                    onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                    onFocus={() => {
                      if (suggestions.length) setSuggestOpen(true)
                    }}
                    aria-invalid={nameValidation?.tone === "error"}
                    className={validationInputClass(nameValidation?.tone)}
                  />
                  <FieldFeedback tone={nameValidation?.tone} message={nameValidation?.message} />
                  {suggestOpen ? (
                    <div className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                      {suggestions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No suggestions</div>
                      ) : (
                        suggestions.map((suggestion) => (
                          <Button
                            key={`${suggestion.name}-${suggestion.merchant?.name ?? ""}`}
                            type="button"
                            variant="ghost"
                            className="h-auto w-full flex-col items-start justify-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              applyTransactionSuggestion(suggestion, setName, setCategory, setMerchant, merchant, category)
                              setSuggestOpen(false)
                            }}
                          >
                            <span className="font-medium">{suggestion.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {suggestion.category?.name} · {suggestion.merchant?.name}
                            </span>
                          </Button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Memo / Notes</Label>
                <Input
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

          <DialogFooter className="flex-col-reverse gap-2 pt-3 sm:flex-row">
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={saving || loading}
              className="w-full sm:mr-auto sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSplit(true)}
              disabled={saving || loading}
              className="w-full sm:w-auto"
            >
              <Scissors className="mr-2 h-4 w-4" />
              Split
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              loading={saving}
              disabled={saving || loading}
              className="w-full sm:w-auto"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
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

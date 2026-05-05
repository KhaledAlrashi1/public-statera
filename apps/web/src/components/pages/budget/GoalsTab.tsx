import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, PiggyBank, Plus, Trash2, Wallet } from "lucide-react"

import { debtApi, goalsApi } from "@/lib/api"
import { getDeletedRecordMessage } from "@/lib/error-recovery"
import { cn, formatKD } from "@/lib/utils"
import {
  type FieldValidation,
  validateNonNegativeAmount,
  validatePositiveAmount,
  validateRequiredText,
} from "@/lib/validation"
import type { SavingsGoal } from "@/types/api"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DebtAccountsSection } from "./DebtAccountsSection"

const GOAL_TYPES = [
  { value: "starter_buffer", label: "Starter Buffer" },
  { value: "emergency_fund", label: "Emergency Fund" },
  { value: "custom", label: "Custom" },
] as const

const MAX_GOAL_AMOUNT = 999_999_999.999

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeGoalNameKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function goalNameValidation(
  value: string,
  existingNameKeys: string[],
  currentGoalNameKey?: string
): FieldValidation {
  const baseValidation = validateRequiredText(value, "Goal name")
  if (baseValidation.tone === "error") return baseValidation
  const normalizedCurrentKey = currentGoalNameKey?.trim().toLocaleLowerCase()
  const keysToCheck = normalizedCurrentKey
    ? existingNameKeys.filter((key) => key !== normalizedCurrentKey)
    : existingNameKeys
  if (keysToCheck.includes(normalizeGoalNameKey(value))) {
    return { tone: "error", message: "You already have a goal with this name." }
  }
  return baseValidation
}

function startingBalanceValidation(currentAmount: string, targetAmount: string): FieldValidation | null {
  const baseValidation = validateNonNegativeAmount(currentAmount, "Starting balance", {
    max: MAX_GOAL_AMOUNT,
  })
  if (baseValidation?.tone === "error") return baseValidation
  if (!currentAmount.trim() || !targetAmount.trim()) return baseValidation

  const parsedCurrent = Number(currentAmount)
  const parsedTarget = Number(targetAmount)
  if (Number.isFinite(parsedCurrent) && Number.isFinite(parsedTarget) && parsedCurrent > parsedTarget) {
    return { tone: "error", message: "Starting balance cannot exceed the target amount." }
  }
  return baseValidation
}

function goalTypeLabel(goalType: SavingsGoal["goal_type"]) {
  const matched = GOAL_TYPES.find((t) => t.value === goalType)
  return matched ? matched.label : "Custom"
}

function formatMonthYear(value: string | null): string | null {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

function GoalFieldNote({
  validation,
  helper,
  id,
}: {
  validation?: FieldValidation | null
  helper?: string
  id: string
}) {
  if (validation?.tone === "error") {
    return (
      <div id={id} className="min-h-5">
        <FieldFeedback tone={validation.tone} message={validation.message} className="min-h-5 leading-5" />
      </div>
    )
  }

  return (
    <p id={id} className="min-h-5 text-xs leading-5 text-muted-foreground">
      {helper ?? ""}
    </p>
  )
}

export function GoalProgressBar({ current, target }: { current: number; target: number }) {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0
  const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0
  const pctRaw = safeTarget > 0 ? (safeCurrent / safeTarget) * 100 : 0
  const pct = Math.min(100, Math.max(0, pctRaw))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{safeTarget > 0 ? `${pct.toFixed(1)}% complete` : "No target set"}</span>
        <span className="tabular-nums">{formatKD(safeCurrent)} / {formatKD(safeTarget)}</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted"
        role="progressbar"
        aria-label="Goal progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={cn(
            "h-2 rounded-full transition-all",
            pct >= 100 ? "bg-success" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export type GoalDialogValues = {
  name: string
  goal_type: SavingsGoal["goal_type"]
  target_kd: string
  current_kd?: string
  target_date?: string | null
}

export function GoalDialog({
  open,
  saving,
  mode = "create",
  initialValues,
  existingNameKeys = [],
  currentGoalNameKey,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  mode?: "create" | "edit"
  initialValues?: Partial<GoalDialogValues>
  existingNameKeys?: string[]
  currentGoalNameKey?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: GoalDialogValues) => Promise<void> | void
}) {
  const [name, setName] = useState("")
  const [goalType, setGoalType] = useState<SavingsGoal["goal_type"]>("custom")
  const [targetAmount, setTargetAmount] = useState("")
  const [currentAmount, setCurrentAmount] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [touched, setTouched] = useState({ name: false, target: false, current: false, date: false })
  const minTargetDate = todayInputValue()

  useEffect(() => {
    if (!open) return
    if (initialValues) {
      setName(initialValues.name ?? "")
      setGoalType(initialValues.goal_type ?? "custom")
      setTargetAmount(initialValues.target_kd ?? "")
      setCurrentAmount(initialValues.current_kd ?? "")
      setTargetDate(initialValues.target_date ?? "")
    } else {
      setName("")
      setGoalType("custom")
      setTargetAmount("")
      setCurrentAmount("")
      setTargetDate("")
    }
    setTouched({ name: false, target: false, current: false, date: false })
  }, [open, initialValues])

  const handleSubmit = async () => {
    const normalizedName = name.trim()
    const normalizedTargetDate = targetDate.trim()
    const nameValidation = goalNameValidation(name, existingNameKeys, currentGoalNameKey)
    const targetValidation = validatePositiveAmount(targetAmount, "Target amount", {
      max: MAX_GOAL_AMOUNT,
    })
    const currentValidation = startingBalanceValidation(currentAmount, targetAmount)
    const targetDateValidation =
      normalizedTargetDate && normalizedTargetDate < minTargetDate
        ? { tone: "error" as const, message: "Target date cannot be in the past." }
        : normalizedTargetDate
          ? { tone: "valid" as const, message: "Target date looks good." }
          : null

    if (
      nameValidation.tone === "error" ||
      targetValidation.tone === "error" ||
      currentValidation?.tone === "error" ||
      targetDateValidation?.tone === "error"
    ) {
      setTouched({ name: true, target: true, current: true, date: true })
      return
    }

    await onSubmit({
      name: normalizedName,
      goal_type: goalType,
      target_kd: Number(targetAmount).toFixed(3),
      current_kd: currentAmount.trim() ? Number(currentAmount).toFixed(3) : undefined,
      target_date: normalizedTargetDate || null,
    })
  }

  const nameValidation = touched.name
    ? goalNameValidation(name, existingNameKeys, currentGoalNameKey)
    : null
  const targetValidation = touched.target
    ? validatePositiveAmount(targetAmount, "Target amount", { max: MAX_GOAL_AMOUNT })
    : null
  const currentValidation =
    touched.current
      ? startingBalanceValidation(currentAmount, targetAmount)
      : null
  const targetDateValidation =
    touched.date && targetDate.trim()
      ? (
        targetDate.trim() < minTargetDate
          ? { tone: "error" as const, message: "Target date cannot be in the past." }
          : { tone: "valid" as const, message: "Target date looks good." }
      )
      : null
  const controlClassName = "h-11 bg-background/80"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-6 sm:w-full">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Savings Goal" : "Add Savings Goal"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update your goal details below."
              : "Create a goal to track progress on your savings journey."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 pt-1">
          <div className="grid gap-2">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input
              id="goal-name"
              placeholder="Emergency Fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={128}
              onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
              aria-invalid={nameValidation?.tone === "error"}
              aria-describedby="goal-name-feedback"
              className={cn(controlClassName, validationInputClass(nameValidation?.tone))}
            />
            <GoalFieldNote id="goal-name-feedback" validation={nameValidation} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="goal-type">Goal type</Label>
            <Select value={goalType} onValueChange={(value) => setGoalType(value as SavingsGoal["goal_type"])}>
              <SelectTrigger id="goal-type" className={controlClassName}>
                <SelectValue placeholder="Select a goal type" />
              </SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div className="grid gap-2">
              <Label htmlFor="goal-target">Target amount (KD)</Label>
              <Input
                id="goal-target"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="1000.000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, target: true }))}
                aria-invalid={targetValidation?.tone === "error"}
                aria-describedby="goal-target-feedback"
                className={cn("money-input", controlClassName, validationInputClass(targetValidation?.tone))}
              />
              <GoalFieldNote id="goal-target-feedback" validation={targetValidation} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="goal-current">Starting balance (optional)</Label>
              <Input
                id="goal-current"
                type="number"
                step="0.001"
                min="0"
                placeholder="0.000"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, current: true }))}
                aria-invalid={currentValidation?.tone === "error"}
                aria-describedby="goal-current-feedback"
                className={cn("money-input", controlClassName, validationInputClass(currentValidation?.tone))}
              />
              <GoalFieldNote
                id="goal-current-feedback"
                validation={currentValidation}
                helper="Only include money you've already set aside."
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="goal-date">Target date (optional)</Label>
            <Input
              id="goal-date"
              type="date"
              value={targetDate}
              min={minTargetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
              aria-invalid={targetDateValidation?.tone === "error"}
              aria-describedby="goal-date-feedback"
              className={cn(controlClassName, validationInputClass(targetDateValidation?.tone))}
            />
            <GoalFieldNote
              id="goal-date-feedback"
              validation={targetDateValidation}
              helper="Leave blank if you don't have a deadline yet."
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-border/50 pt-4 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DepositDialog({
  open,
  goalName,
  currentAmount,
  targetAmount,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  goalName: string
  currentAmount: number
  targetAmount: number
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (amount_kd: string) => Promise<void> | void
}) {
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount("")
    setError(null)
    setTouched(false)
  }, [open])

  const remainingAmount = Math.max(0, targetAmount - currentAmount)

  const handleSubmit = async () => {
    const amountValidation = validatePositiveAmount(amount, "Deposit amount", {
      max: MAX_GOAL_AMOUNT,
    })
    if (amountValidation.tone === "error") {
      setError(amountValidation.message)
      return
    }

    if (remainingAmount <= 0) {
      setError("This goal is already fully funded.")
      return
    }

    const parsed = Number(amount.trim())
    if (parsed > remainingAmount + 0.0005) {
      setError("Deposit exceeds the remaining amount for this goal.")
      return
    }
    setError(null)
    await onSubmit(parsed.toFixed(3))
  }

  const amountValidation = touched || Boolean(error)
    ? (() => {
      const baseValidation = validatePositiveAmount(amount, "Deposit amount", {
        max: MAX_GOAL_AMOUNT,
      })
      if (baseValidation.tone === "error") return baseValidation
      if (remainingAmount <= 0) {
        return { tone: "error" as const, message: "This goal is already fully funded." }
      }
      const parsed = Number(amount.trim())
      if (amount.trim() && Number.isFinite(parsed) && parsed > remainingAmount + 0.0005) {
        return {
          tone: "error" as const,
          message: "Deposit exceeds the remaining amount for this goal.",
        }
      }
      return baseValidation
    })()
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Add Deposit</DialogTitle>
          <DialogDescription>
            Add a manual contribution to {goalName || "this goal"}.
          </DialogDescription>
        </DialogHeader>

        <div className="inner-card grid gap-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Current</span>
            <span className="tabular-nums font-semibold">{formatKD(currentAmount)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Remaining</span>
            <span className="tabular-nums font-semibold">{formatKD(remainingAmount)}</span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="goal-deposit-amount">Amount (KD)</Label>
          <Input
            id="goal-deposit-amount"
            type="number"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50.000"
            onBlur={() => setTouched(true)}
            aria-invalid={amountValidation?.tone === "error"}
            className={cn("money-input h-11", validationInputClass(amountValidation?.tone))}
          />
          <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            loading={saving}
            disabled={saving || remainingAmount <= 0}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : "Add Deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GoalsTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalDialogPreset, setGoalDialogPreset] = useState<Partial<GoalDialogValues> | undefined>(undefined)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositingGoal, setDepositingGoal] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingGoal, setDeletingGoal] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null)

  const { data: goals = [], isLoading, error } = useQuery({
    queryKey: ["savings-goals"],
    queryFn: () => goalsApi.list(),
  })

  const {
    data: debtSummary,
    error: debtSummaryError,
    isFetching: debtSummaryFetching,
    refetch: refetchDebtSummary,
  } = useQuery({
    queryKey: ["debt-accounts", "summary"],
    queryFn: () => debtApi.summary(),
    staleTime: 5 * 60 * 1000,
  })
  // Use the lightweight summary endpoint so GoalsTab doesn't fetch full account objects
  // purely to decide whether the debt-advice banner should appear.
  const hasActiveDebt = (debtSummary?.account_count ?? 0) > 0
  const hasNoDebtSetup = debtSummary !== undefined && debtSummary.account_count === 0
  const debtSummaryErrorMessage = debtSummaryError instanceof Error
    ? debtSummaryError.message
    : debtSummaryError
      ? "We couldn't load your debt summary right now."
      : null

  const activeGoals = useMemo(() => goals.filter((goal) => goal.is_active), [goals])
  const createGoalExistingNameKeys = useMemo(
    () => activeGoals.map((goal) => normalizeGoalNameKey(goal.name)),
    [activeGoals]
  )
  const editGoalExistingNameKeys = useMemo(
    () => activeGoals
      .filter((goal) => goal.id !== selectedGoal?.id)
      .map((goal) => normalizeGoalNameKey(goal.name)),
    [activeGoals, selectedGoal?.id]
  )
  const hasEmergencyFund = activeGoals.some((g) => g.goal_type === "emergency_fund")

  const refreshGoals = async () => {
    await queryClient.invalidateQueries({ queryKey: ["savings-goals"] })
    await queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
    await queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
    await queryClient.invalidateQueries({ queryKey: ["insights", "safe-to-spend"] })
  }

  const openCreateGoal = (preset?: Partial<GoalDialogValues>) => {
    setGoalDialogPreset(preset)
    setGoalDialogOpen(true)
  }

  const handleCreateGoal = async (values: GoalDialogValues) => {
    setCreatingGoal(true)
    try {
      await goalsApi.create(values)
      await refreshGoals()
      setGoalDialogOpen(false)
      setGoalDialogPreset(undefined)
      toast.success("Savings goal created.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't create that savings goal right now."
      toast.error(msg)
    } finally {
      setCreatingGoal(false)
    }
  }

  const handleUpdateGoal = async (values: GoalDialogValues) => {
    if (!selectedGoal) return
    setEditingGoal(true)
    try {
      await goalsApi.update(selectedGoal.id, values)
      await refreshGoals()
      setEditDialogOpen(false)
      setSelectedGoal(null)
      toast.success("Goal updated.")
    } catch (err) {
      const deletedMessage = getDeletedRecordMessage(err, "goal")
      if (deletedMessage) {
        await refreshGoals()
        setEditDialogOpen(false)
        setSelectedGoal(null)
        toast.error(deletedMessage)
        return
      }
      const msg = err instanceof Error ? err.message : "We couldn't update that goal right now."
      toast.error(msg)
    } finally {
      setEditingGoal(false)
    }
  }

  const handleDepositGoal = async (amount_kd: string) => {
    if (!selectedGoal) return
    setDepositingGoal(true)
    try {
      await goalsApi.deposit(selectedGoal.id, amount_kd)
      await refreshGoals()
      setDepositOpen(false)
      setSelectedGoal(null)
      toast.success("Deposit added.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't add that deposit right now."
      toast.error(msg)
    } finally {
      setDepositingGoal(false)
    }
  }

  const handleDeleteGoal = async () => {
    if (!selectedGoal) return
    setDeletingGoal(true)
    try {
      await goalsApi.delete(selectedGoal.id)
      await refreshGoals()
      setDeleteOpen(false)
      setSelectedGoal(null)
      toast.success("Goal deleted.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't delete that goal right now."
      toast.error(msg)
    } finally {
      setDeletingGoal(false)
    }
  }

  return (
    <>
      <section className="space-y-4">
        <div className="surface-row-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Debt Tracker
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep loan balances, minimums, and payoff scenarios together so your monthly plan stays grounded in reality.
          </p>
        </div>
        {debtSummaryErrorMessage ? (
          <div className="status-card status-card-warning flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-warning">Debt summary unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">{debtSummaryErrorMessage}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchDebtSummary()
              }}
              loading={debtSummaryFetching}
              disabled={debtSummaryFetching}
            >
              {debtSummaryFetching ? "Retrying..." : "Retry"}
            </Button>
          </div>
        ) : null}
        {hasNoDebtSetup ? (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <p className="font-semibold">Track your debts here</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add loans, credit cards, and other liabilities to see your total balance,
              minimum payments due, and a payoff plan across all accounts.
            </p>
          </div>
        ) : null}
        <DebtAccountsSection />
      </section>

      <section className="space-y-4">
        <div className="surface-row-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Savings Goals
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create clear milestones for emergency savings, buffers, and custom goals, then track deposits against them.
          </p>
        </div>

        <section id="savings-goals" className="section-panel float-in">
        <div className="section-header section-header-divider">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <PiggyBank className="h-4 w-4 text-primary" />
            Savings Goals
          </div>
          <Button
            type="button"
            variant="default"
            onClick={() => openCreateGoal()}
            className="h-8 gap-1 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Goal
          </Button>
        </div>

        <div className="section-body space-y-3">
          {hasActiveDebt ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-semibold text-warning">You have active debt</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Financial best practice: clear high-interest debt before adding new savings goals.
                Paying off debt often gives a better guaranteed return than saving.
              </p>
            </div>
          ) : !hasEmergencyFund ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
              <p className="font-semibold">Debt-free — great work!</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your next financial step is building an emergency fund (3–6 months of expenses).
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-7 border-primary/40 px-3 text-xs text-primary hover:bg-primary/10"
                onClick={() => openCreateGoal({ goal_type: "emergency_fund", name: "Emergency Fund" })}
              >
                Set up emergency fund
              </Button>
            </div>
          ) : null}
          {isLoading ? (
            <>
              <div className="skeleton h-28 w-full" />
              <div className="skeleton h-28 w-full" />
            </>
          ) : error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              We couldn't load your savings goals right now.
            </div>
          ) : activeGoals.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="h-5 w-5" />}
              title="Set your first savings goal"
              description="Add a goal to track your next milestone and set aside money each month."
              action={(
                <Button type="button" variant="default" size="sm" onClick={() => openCreateGoal()}>
                  Add your first goal
                </Button>
              )}
            />
          ) : (
            activeGoals.map((goal) => {
              const current = Number(goal.current_kd || 0)
              const target = Number(goal.target_kd || 0)
              const projection = goal.projection || null
              const projectedMonth = formatMonthYear(projection?.projected_date || null)
              const requiredMonthly = Number(projection?.required_monthly || 0)
              const currentPace = projection?.current_pace_monthly || "0.000"
              const isComplete = target > 0 && current >= target
              const isOnTrack = !!goal.target_date && !!projection?.on_track
              const hasProjection = Boolean(projection)
              const statusLabel = isComplete
                ? "Completed"
                : goal.target_date
                  ? (!hasProjection ? "Unknown" : projection?.on_track ? "On track" : "Behind")
                  : "No target date"
              const statusClass = isComplete
                ? "border-success/40 bg-success/12 text-success"
                : goal.target_date
                  ? (!hasProjection
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : projection?.on_track
                    ? "border-success/35 bg-success/10 text-success"
                    : "border-warning/35 bg-warning/10 text-warning")
                  : "border-border bg-muted/40 text-muted-foreground"
              return (
                <article
                  key={goal.id}
                  className={cn(
                    "inner-card space-y-3",
                    isComplete && "goal-complete-celebration border-success/25 bg-success/5"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{goal.name}</h3>
                      <p className="text-xs text-muted-foreground">{goalTypeLabel(goal.goal_type)}</p>
                      {goal.target_date ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusClass)}>
                            {statusLabel}
                          </span>
                          {projectedMonth ? (
                            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                              Projected: {projectedMonth}
                            </span>
                          ) : null}
                          {requiredMonthly > 0 ? (
                            <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                              Needs <span className="tabular-nums">{formatKD(requiredMonthly)}</span>/month
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isComplete}
                        onClick={() => {
                          setSelectedGoal(goal)
                          setDepositOpen(true)
                        }}
                      >
                        <Wallet className="mr-1 h-3.5 w-3.5" />
                        Deposit
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setSelectedGoal(goal)
                              setEditDialogOpen(true)
                            }}
                            aria-label={`Edit goal ${goal.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit goal</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              setSelectedGoal(goal)
                              setDeleteOpen(true)
                            }}
                            aria-label={`Delete goal ${goal.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete goal</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <GoalProgressBar current={current} target={target} />

                  {isComplete ? (
                    <div className="rounded-[var(--radius-inner)] border border-success/25 bg-success/8 px-3 py-2 text-xs font-medium text-success">
                      You have already reached this goal.
                    </div>
                  ) : isOnTrack ? (
                    <div className="rounded-[var(--radius-inner)] border border-success/25 bg-success/8 px-3 py-2 text-xs font-medium text-success">
                      You are on pace for this goal.
                    </div>
                  ) : goal.target_date && !hasProjection ? (
                    <div className="rounded-[var(--radius-inner)] border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      We need a little more data before this goal can be projected.
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Current pace: <span className="tabular-nums">{formatKD(currentPace)}</span> / month</span>
                    {goal.target_date ? (
                      <span>Target: {formatMonthYear(goal.target_date) ?? goal.target_date}</span>
                    ) : null}
                  </div>
                </article>
              )
            })
          )}
        </div>
        </section>
      </section>

      <GoalDialog
        open={goalDialogOpen}
        saving={creatingGoal}
        initialValues={goalDialogPreset}
        existingNameKeys={createGoalExistingNameKeys}
        onOpenChange={(v) => {
          setGoalDialogOpen(v)
          if (!v) setGoalDialogPreset(undefined)
        }}
        onSubmit={handleCreateGoal}
      />

      <GoalDialog
        open={editDialogOpen}
        saving={editingGoal}
        mode="edit"
        existingNameKeys={editGoalExistingNameKeys}
        currentGoalNameKey={selectedGoal ? normalizeGoalNameKey(selectedGoal.name) : undefined}
        initialValues={selectedGoal ? {
          name: selectedGoal.name,
          goal_type: selectedGoal.goal_type,
          target_kd: selectedGoal.target_kd,
          current_kd: selectedGoal.current_kd ?? undefined,
          target_date: selectedGoal.target_date ?? null,
        } : undefined}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) setSelectedGoal(null)
        }}
        onSubmit={handleUpdateGoal}
      />

      <DepositDialog
        open={depositOpen}
        goalName={selectedGoal?.name || ""}
        currentAmount={Number(selectedGoal?.current_kd || 0)}
        targetAmount={Number(selectedGoal?.target_kd || 0)}
        saving={depositingGoal}
        onOpenChange={(open) => {
          setDepositOpen(open)
          if (!open) setSelectedGoal(null)
        }}
        onSubmit={handleDepositGoal}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setSelectedGoal(null)
        }}
        title="Delete savings goal?"
        message={`Delete "${selectedGoal?.name || "this goal"}"? This will hide it from your active goals.`}
        onConfirm={handleDeleteGoal}
        loading={deletingGoal}
      />
    </>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"

import { authApi, debtApi } from "@/lib/api"
import { formatKD } from "@/lib/utils"
import type { DebtAccount } from "@/types/api"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DebtDialog, type DebtDialogValues } from "@/components/pages/profile/DebtDialog"
// PayoffPlanPanel HIDDEN — Payoff Calculator removed; do not re-add without owner instruction
function debtTypeLabel(debtType: DebtAccount["debt_type"]): string {
  switch (debtType) {
    case "credit_card":
      return "Credit Card"
    case "personal_loan":
      return "Personal Loan"
    case "car_loan":
      return "Car Loan"
    default:
      return "Other"
  }
}

export function DebtAccountsSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [debtDialogOpen, setDebtDialogOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<DebtAccount | null>(null)
  const [savingDebt, setSavingDebt] = useState(false)
  const [deletingDebtId, setDeletingDebtId] = useState<number | null>(null)
  const [deletingDebt, setDeletingDebt] = useState(false)
  const [savingDebtChoice, setSavingDebtChoice] = useState(false)
  const migratedLegacyChoiceRef = useRef(false)

  const {
    data: debtAccounts = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["debt-accounts", "active"],
    queryFn: () => debtApi.list(),
    select: (items) => items.filter((item) => item.is_active),
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: profileResp,
    isLoading: profileLoading,
    isFetching: profileFetching,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["auth-profile", "debt-onboarding"],
    queryFn: () => authApi.profile(),
    staleTime: 5 * 60 * 1000,
  })

  const profileDebtChoice = profileResp?.profile?.has_debt_choice
  const hasDebtChoice: "yes" | "no" | null = profileDebtChoice === true ? "yes" : profileDebtChoice === false ? "no" : null

  const debtTotals = useMemo(() => {
    let balanceTotal = 0
    let minimumTotal = 0
    for (const account of debtAccounts) {
      balanceTotal += Number(account.balance_kd || 0)
      minimumTotal += Number(account.minimum_payment_kd || 0)
    }
    return { balanceTotal, minimumTotal }
  }, [debtAccounts])

  const deletingDebtAccount = useMemo(() => {
    if (deletingDebtId === null) return null
    return debtAccounts.find((account) => account.id === deletingDebtId) ?? null
  }, [debtAccounts, deletingDebtId])

  const refreshDebtData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["debt-accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["debt-accounts-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics-account-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
    ])
  }

  const setDebtChoice = useCallback(async (choice: "yes" | "no") => {
    setSavingDebtChoice(true)
    try {
      const nextValue = choice === "yes"
      const response = await authApi.updateProfile({ has_debt_choice: nextValue })
      queryClient.setQueriesData({ queryKey: ["auth-profile"] }, (current: unknown) => {
        if (!current || typeof current !== "object") return current
        const payload = current as { profile?: Record<string, unknown> }
        return {
          ...payload,
          profile: {
            ...(payload.profile || {}),
            has_debt_choice: response.profile?.has_debt_choice ?? nextValue,
          },
        }
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't save that choice right now."
      toast.error(message)
      return false
    } finally {
      setSavingDebtChoice(false)
    }
  }, [queryClient, toast])

  useEffect(() => {
    if (profileLoading || hasDebtChoice !== null || migratedLegacyChoiceRef.current) return
    if (typeof window === "undefined") return
    try {
      const legacyChoice = window.localStorage.getItem("debt-onboarding-choice")
      if (legacyChoice !== "yes" && legacyChoice !== "no") {
        migratedLegacyChoiceRef.current = true
        return
      }
      migratedLegacyChoiceRef.current = true
      void setDebtChoice(legacyChoice)
      window.localStorage.removeItem("debt-onboarding-choice")
    } catch {
      migratedLegacyChoiceRef.current = true
    }
  }, [hasDebtChoice, profileLoading, setDebtChoice])

  const openAddDebt = () => {
    setEditingDebt(null)
    setDebtDialogOpen(true)
  }

  const openEditDebt = (account: DebtAccount) => {
    setEditingDebt(account)
    setDebtDialogOpen(true)
  }

  const saveDebt = async (payload: DebtDialogValues) => {
    setSavingDebt(true)
    try {
      if (editingDebt) {
        await debtApi.update(editingDebt.id, payload)
        toast.success("Debt account updated.")
      } else {
        await debtApi.create(payload)
        toast.success("Debt account added.")
      }
      setDebtDialogOpen(false)
      setEditingDebt(null)
      await refreshDebtData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't save that debt account right now."
      toast.error(message)
    } finally {
      setSavingDebt(false)
    }
  }

  const confirmDeleteDebt = async () => {
    if (!deletingDebtId) return
    setDeletingDebt(true)
    try {
      await debtApi.delete(deletingDebtId)
      setDeletingDebtId(null)
      toast.success("Debt account removed.")
      await refreshDebtData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't remove this debt account right now."
      toast.error(message)
    } finally {
      setDeletingDebt(false)
    }
  }

  const loadErrorSource = error || profileError
  const loadError = loadErrorSource instanceof Error
    ? loadErrorSource.message
    : loadErrorSource
      ? "We couldn't load your debt tracker right now."
      : null

  return (
    <>
      <section id="debt-tracker" className="section-panel float-in">
        <div className="section-header section-header-divider">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CreditCard className="h-4 w-4 text-primary" />
              Debt Tracker
            </div>
            <div className="text-xs text-muted-foreground">
              Track balances, minimum payments, and payoff scenarios in one place.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isLoading || isFetching}
              onClick={() => {
                void refetch()
              }}
              disabled={isLoading || isFetching || profileLoading || savingDebt || deletingDebt || savingDebtChoice}
            >
              {isLoading || isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={openAddDebt}
              disabled={isLoading || isFetching || profileLoading || savingDebt || deletingDebt || savingDebtChoice}
            >
              Add Debt
            </Button>
          </div>
        </div>

        <div className="section-body">
          {loadError ? (
            <div className="status-card status-card-danger space-y-3">
              <p>{loadError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isFetching || profileFetching}
                onClick={() => {
                  void Promise.all([
                    refetch(),
                    refetchProfile(),
                  ])
                }}
                disabled={isFetching || profileFetching || savingDebt || deletingDebt || savingDebtChoice}
              >
                {isFetching || profileFetching ? "Refreshing..." : "Retry"}
              </Button>
            </div>
          ) : isLoading || profileLoading ? (
            <div className="grid gap-2">
              <div className="skeleton h-16" />
              <div className="skeleton h-16" />
            </div>
          ) : debtAccounts.length === 0 && hasDebtChoice === null ? (
            <div className="surface-muted-card p-5 text-sm">
              <p className="font-semibold">Do you have any debt?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Credit cards, personal loans, car loans, or other balances — tracking them improves your Safe-to-Spend accuracy.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={savingDebtChoice}
                  onClick={async () => {
                    const saved = await setDebtChoice("yes")
                    if (saved) openAddDebt()
                  }}
                >
                  Yes, track my debt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingDebtChoice}
                  onClick={() => {
                    void setDebtChoice("no")
                  }}
                >
                  No, I&apos;m debt-free
                </Button>
              </div>
            </div>
          ) : debtAccounts.length === 0 ? (
            <div className="surface-dashed-card p-4 text-sm text-muted-foreground">
              {hasDebtChoice === "no"
                ? "You are debt-free right now. Great work."
                : "Add your credit cards and loans here so Safe to Spend stays accurate."}
            </div>
          ) : (
            <div className="space-y-2">
              {debtAccounts.map((account) => (
                <div
                  key={account.id}
                  className="inner-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {debtTypeLabel(account.debt_type)} • Minimum <span className="tabular-nums">{formatKD(account.minimum_payment_kd)}</span>
                      {account.due_day ? ` • Due ${account.due_day}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="mr-1 text-sm font-semibold tabular-nums">{formatKD(account.balance_kd)}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditDebt(account)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeletingDebtId(account.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <div className="surface-row-card px-3 py-2 text-sm">
                <p className="font-semibold tabular-nums">
                  Total: {formatKD(debtTotals.balanceTotal)} • Minimums: {formatKD(debtTotals.minimumTotal)} / mo
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Payoff Calculator section HIDDEN — removed pending feature readiness; do not re-add without owner instruction */}

      <DebtDialog
        open={debtDialogOpen}
        onOpenChange={(next) => {
          setDebtDialogOpen(next)
          if (!next) setEditingDebt(null)
        }}
        account={editingDebt}
        saving={savingDebt}
        onSubmit={saveDebt}
      />

      <ConfirmDialog
        open={deletingDebtId !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingDebtId(null)
        }}
        title="Remove debt account?"
        message={
          deletingDebtAccount
            ? `Remove "${deletingDebtAccount.name}" from active debts? This will stop counting it in Safe-to-Spend.`
            : "Remove this debt account from active debts?"
        }
        onConfirm={() => {
          void confirmDeleteDebt()
        }}
        loading={deletingDebt}
        confirmLabel="Remove"
        loadingLabel="Removing..."
      />
    </>
  )
}

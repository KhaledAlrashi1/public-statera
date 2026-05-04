import { useEffect, useMemo, useState } from "react"

import { debtApi } from "@/lib/api"
import { getChartColors } from "@/lib/chart-tokens"
import { formatKD } from "@/lib/utils"
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "@/lib/recharts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DebtAccount, DebtPayoffPlan, DebtPayoffPlansResponse } from "@/types/api"

function formatMonthYear(isoDate: string): string {
  if (!isoDate) return "-"
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleDateString([], { month: "short", year: "numeric" })
}

export function PayoffPlanPanel({ debtAccounts }: { debtAccounts: DebtAccount[] }) {
  const minimumRequired = useMemo(
    () =>
      debtAccounts.reduce((sum, row) => sum + (Number(row.minimum_payment_kd || 0) || 0), 0),
    [debtAccounts]
  )
  const totalBalance = useMemo(
    () => debtAccounts.reduce((sum, row) => sum + (Number(row.balance_kd || 0) || 0), 0),
    [debtAccounts]
  )

  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche")
  const [monthlyPayment, setMonthlyPayment] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<DebtPayoffPlansResponse | null>(null)
  const chartColors = getChartColors()

  useEffect(() => {
    if (debtAccounts.length === 0) {
      setMonthlyPayment(0)
      setPlans(null)
      setError(null)
      return
    }
    const recommended = Math.max(minimumRequired, Math.min(totalBalance, minimumRequired * 1.4))
    setMonthlyPayment((prev) => {
      if (prev <= 0) return Number(recommended.toFixed(3))
      if (prev < minimumRequired) return Number(minimumRequired.toFixed(3))
      return prev
    })
  }, [debtAccounts, minimumRequired, totalBalance])

  useEffect(() => {
    if (debtAccounts.length === 0) return
    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) return
    if (monthlyPayment < minimumRequired) {
      setError(`Monthly payment must be at least ${formatKD(minimumRequired)}.`)
      return
    }

    setLoading(true)
    setError(null)
    const timer = window.setTimeout(async () => {
      try {
        const data = await debtApi.payoffPlan(monthlyPayment.toFixed(3))
        setPlans(data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to calculate payoff plans."
        setError(msg)
        setPlans(null)
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [debtAccounts, monthlyPayment, minimumRequired])

  if (debtAccounts.length === 0) {
    return (
      <div className="surface-dashed-card p-4 text-sm text-muted-foreground">
        Add at least one active debt account to calculate an avalanche or snowball payoff plan.
      </div>
    )
  }

  const activePlan: DebtPayoffPlan | null =
    strategy === "avalanche" ? plans?.avalanche || null : plans?.snowball || null

  const sliderMin = Math.max(1, Number(minimumRequired.toFixed(3)))
  const sliderMax = Math.max(sliderMin + 10, Math.ceil(Math.max(totalBalance, minimumRequired * 3)))
  const chartData =
    activePlan?.payoff_order.map((row) => ({
      name: row.name,
      months: row.months_to_payoff,
    })) || []
  const payoffImpossible = Boolean(activePlan?.debt_free_impossible)

  return (
    <div className="surface-muted-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Payoff Calculator</h3>
        <div className="segmented-surface inline-flex gap-0.5 border border-border/60">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs ${strategy === "avalanche" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setStrategy("avalanche")}
          >
            Avalanche
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs ${strategy === "snowball" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setStrategy("snowball")}
          >
            Snowball
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Compare debt-free timelines and total interest at your chosen monthly payment.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_150px]">
        <div className="space-y-2">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={Math.max(sliderMin, Math.min(sliderMax, monthlyPayment || sliderMin))}
            onChange={(e) => setMonthlyPayment(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Min {formatKD(sliderMin)}</span>
            <span>Max {formatKD(sliderMax)}</span>
          </div>
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="payoff-monthly-payment">
            Monthly payment (KD)
          </label>
          <Input
            id="payoff-monthly-payment"
            type="number"
            min={sliderMin}
            step="0.001"
            value={Number.isFinite(monthlyPayment) ? monthlyPayment : ""}
            onChange={(e) => setMonthlyPayment(Number(e.target.value || 0))}
            placeholder={minimumRequired.toFixed(3)}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="surface-row-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Debt-Free Date</p>
          <p className="text-sm font-semibold">
            {activePlan ? formatMonthYear(activePlan.debt_free_date) : "-"}
          </p>
        </div>
        <div className="surface-row-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Total Interest</p>
          <p className="text-sm font-semibold">
            {activePlan ? formatKD(activePlan.total_interest_paid) : "-"}
          </p>
        </div>
        <div className="surface-row-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Months Remaining</p>
          <p className="text-sm font-semibold">
            {activePlan ? activePlan.total_months : "-"}
          </p>
        </div>
      </div>

      {loading && (
        <div className="mt-3 text-sm text-muted-foreground">Calculating payoff plans...</div>
      )}
      {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
      {!loading && !error && payoffImpossible && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          This payment level does not pay the debts off within 50 years. Increase the monthly payment to reach a
          realistic debt-free date.
        </div>
      )}

      {!loading && !error && activePlan && !payoffImpossible && (
        <>
          {chartData.length > 0 && (
            <div className="mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [`${value} months`, "Payoff"]} />
                  <Bar dataKey="months" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={`${entry.name}-${idx}`} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {activePlan.payoff_order.map((row) => (
              <div key={`${row.debt_id}:${row.name}`} className="surface-row-card flex flex-wrap items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Balance {formatKD(row.balance)} | APR {formatKD(row.rate)}%
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">{row.months_to_payoff} months</p>
                  <p className="text-muted-foreground">Pays off {formatMonthYear(row.payoff_date)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (monthlyPayment < minimumRequired) {
              setMonthlyPayment(Number(minimumRequired.toFixed(3)))
            } else {
              setMonthlyPayment((prev) => Number((prev + 10).toFixed(3)))
            }
          }}
        >
          Increase by KD 10
        </Button>
      </div>
    </div>
  )
}

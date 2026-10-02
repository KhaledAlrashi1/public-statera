import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

// MOB-R36 #7, shared since MOB-R46/R47 by Profile and the income pop-up. The field accepts what the
// server's parseKd accepts: a positive amount with at most three decimals (apps/api/src/lib/kd.ts).
// A value of zero is rejected there too.
export const MONTHLY_INCOME_INVALID_MESSAGE = "Enter an amount above zero, with up to 3 decimals."

export function isValidMonthlyIncome(raw: string): boolean {
  const s = raw.trim()
  return /^\d+(\.\d{1,3})?$/.test(s) && !/^0+(\.0+)?$/.test(s)
}

// The typed income feeds Home (the profile query), Plan (budgets' profile_context, also carried in
// the dashboard bundle) and Insights (R9 safe-to-spend). Invalidate all of them on change; the
// server clears R9's Redis cache on the same write (MOB-R33 C1).
export function useInvalidateIncomeQueries() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["insights"] }),
    ])
  }, [queryClient])
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { categoriesApi } from "@/lib/api"
import { AddTransactionDialog } from "@/components/pages/transactions/dialogs"

type QuickAddType = "expense" | "income"

type QuickAddContextValue = {
  openQuickAdd: (type?: QuickAddType) => void
  closeQuickAdd: () => void
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [initialType, setInitialType] = useState<QuickAddType>("expense")

  const {
    data: categories = [],
    error: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
    staleTime: 5 * 60 * 1000,
  })

  const categoryNames = useMemo(
    () => categories.map((category) => category.name),
    [categories]
  )

  const openQuickAdd = useCallback((type: QuickAddType = "expense") => {
    setInitialType(type)
    setOpen(true)
  }, [])

  const closeQuickAdd = useCallback(() => {
    setOpen(false)
  }, [])

  const handleSuccess = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["merchants"] }),
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["budget-items"] }),
      queryClient.invalidateQueries({ queryKey: ["budget-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["debt-accounts-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics-account-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] }),
      queryClient.invalidateQueries({ queryKey: ["insights"] }),
    ])
  }, [queryClient])

  const value = useMemo<QuickAddContextValue>(
    () => ({
      openQuickAdd,
      closeQuickAdd,
    }),
    [closeQuickAdd, openQuickAdd]
  )

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <AddTransactionDialog
        open={open}
        onOpenChange={setOpen}
        initialType={initialType}
        categories={categoryNames}
        categoriesError={
          categoriesError instanceof Error
            ? categoriesError.message
            : categoriesError
              ? "We couldn't load categories for quick add."
              : null
        }
        categoriesLoading={categoriesFetching && categoryNames.length === 0}
        onRetryCategories={() => {
          void refetchCategories()
        }}
        onSuccess={handleSuccess}
      />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider")
  return ctx
}

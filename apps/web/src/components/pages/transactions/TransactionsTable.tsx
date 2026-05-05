import React, { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ClipboardList,
  Upload,
} from "lucide-react"

import { transactionsApi } from "@/lib/api"
import { cn, formatAmount, formatKD, isIncome } from "@/lib/utils"
import type { Transaction } from "@/types/api"
import { CategoryBadge } from "@/components/ui/category-badge"
import { FilterBar } from "@/components/ui/filter-bar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { useDebounce } from "./helpers"

function TransactionsTable({
  categories,
  merchants,
  onEdit,
  onImport,
  refreshSignal,
  transactionType = "all",
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: {
  categories: string[]
  merchants: string[]
  onEdit: (id: number) => void
  onImport?: () => void
  refreshSignal: number
  transactionType?: "all" | "expense" | "income"
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onSelectAll?: (ids: number[]) => void
}) {
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [merchant, setMerchant] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [offset, setOffset] = useState(0)
  const [allRows, setAllRows] = useState<Transaction[]>([])
  const limit = 20

  const debouncedQ = useDebounce(q, 200)
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const dateRangeError = invalidDateRange ? "Start date must be on or before end date." : null

  useEffect(() => {
    setAllRows([])
    setOffset(0)
  }, [debouncedQ, category, merchant, dateFrom, dateTo, transactionType])

  useEffect(() => {
    setAllRows([])
    setOffset(0)
  }, [refreshSignal])

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "transactions",
      "search",
      debouncedQ,
      category,
      merchant,
      dateFrom,
      dateTo,
      transactionType,
      offset,
    ],
    enabled: !invalidDateRange,
    queryFn: () =>
      transactionsApi.search({
        q: debouncedQ || undefined,
        category: category || undefined,
        merchant: merchant || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        income_only: transactionType === "income" ? true : undefined,
        exclude_income: transactionType === "expense" ? true : undefined,
        limit,
        offset,
      }),
  })

  useEffect(() => {
    if (!data?.items) return
    setAllRows((prev) =>
      offset === 0 ? data.items : [...prev, ...data.items]
    )
  }, [data, offset])

  const total = data?.total || 0
  const hasMore = data?.has_more || false
  const queryErrorMessage = error instanceof Error
    ? error.message
    : error
      ? "We couldn't load this activity view right now."
      : null

  const rows = allRows
  const hasDateFilter = !!dateFrom || !!dateTo
  const hasAnyFilter = !!debouncedQ || !!category || !!merchant || hasDateFilter

  const filteredTotal = useMemo(
    () =>
      rows.reduce(
        (sum, row) => {
          const amount = parseFloat(row.amount_kd) || 0
          if (transactionType === "income") {
            return isIncome(row.category) ? sum + amount : sum
          }
          if (transactionType === "expense") {
            return isIncome(row.category) ? sum : sum + amount
          }
          return sum + amount
        },
        0
      ),
    [rows, transactionType]
  )

  const clearFilters = () => {
    setQ("")
    setCategory("")
    setMerchant("")
    setDateFrom("")
    setDateTo("")
  }

  const getTxnId = (row: Transaction) => row.transaction_id ?? row.id

  const colSpanFull = 7
  const allVisibleIds = allRows.map((r) => r.transaction_id ?? r.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds?.has(id))
  const sectionLabel =
    transactionType === "expense"
      ? "Recent Expenses"
      : transactionType === "income"
        ? "Recent Income"
        : "Recent Activity"
  const searchPlaceholder =
    transactionType === "expense"
      ? "Search expenses..."
      : transactionType === "income"
        ? "Search income..."
        : "Search activity..."
  const emptyLabel =
    transactionType === "expense"
      ? "expenses"
      : transactionType === "income"
        ? "income entries"
        : "activity records"
  const emptyState = hasAnyFilter
    ? {
        title: hasDateFilter ? `No ${emptyLabel} in this date range` : `No ${emptyLabel} match this view`,
        description: "Try widening the date range or clearing a few filters to bring more activity back into view.",
      }
    : transactionType === "expense"
      ? {
          title: "No expenses yet",
          description: "Add or import your first expense to start tracking where your money goes.",
        }
      : transactionType === "income"
        ? {
            title: "No income entries yet",
            description: "Record a paycheck, transfer, or other income so cash inflow appears in your history.",
          }
        : {
            title: "No transactions yet",
            description: "Import your first transactions or add one manually to start building your money timeline.",
          }
  return (
    <section className="section-panel panel-featured overflow-hidden float-in stagger-2">
      <div className="section-header">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" />
          {sectionLabel}
        </h2>
        <span className="text-xs text-muted-foreground">Newest first</span>
      </div>

      <FilterBar
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder={searchPlaceholder}
        mobileCollapsible
        mobileButtonLabel="More filters"
        filters={[
          {
            value: category || "__all__",
            onChange: (v) => setCategory(v === "__all__" ? "" : v),
            options: [
              { value: "__all__", label: "All categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ],
            placeholder: "All categories",
            width: "w-[160px]",
          },
          {
            value: merchant || "__all__",
            onChange: (v) => setMerchant(v === "__all__" ? "" : v),
            options: [
              { value: "__all__", label: "All merchants" },
              ...merchants.map((m) => ({ value: m, label: m })),
            ],
            placeholder: "All merchants",
            width: "w-[160px]",
          },
        ]}
        dateRange={{
          from: dateFrom,
          to: dateTo,
          onFromChange: setDateFrom,
          onToChange: setDateTo,
          error: dateRangeError,
        }}
        onClear={clearFilters}
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-border/40 px-4 py-2">
        <div className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
          {total === 0 ? (
            hasAnyFilter ? "No matches" : "No transactions"
          ) : allRows.length >= total ? (
            <>
              <strong className="text-foreground">{total.toLocaleString()}</strong>{" "}
              {hasDateFilter ? "in date range" : `transaction${total === 1 ? "" : "s"}`}
            </>
          ) : (
            <>
              Showing <strong className="text-foreground">{allRows.length.toLocaleString()}</strong>{" "}
              of <strong className="text-foreground">{total.toLocaleString()}</strong>
              {hasDateFilter ? " in date range" : ""}
            </>
          )}
        </div>

        {(hasDateFilter || rows.length > 0) && total > 0 && (
          <div className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium tabular-nums text-primary">
            {hasMore ? "Loaded total" : "Total"}: {formatKD(filteredTotal)}
          </div>
        )}
      </div>

      {queryErrorMessage ? (
        <div className="mx-4 mt-4 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-warning">Activity unavailable</p>
              <p className="mt-1 text-muted-foreground">{queryErrorMessage}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetch()
              }}
              loading={isFetching}
              disabled={isFetching || invalidDateRange}
            >
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 p-4 md:hidden">
        {isLoading && allRows.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-32 rounded-[var(--radius-inner)]" />
          ))
        ) : rows.length === 0 && !queryErrorMessage ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={emptyState.title}
            description={emptyState.description}
            action={onImport && !hasDateFilter ? (
              <Button
                type="button"
                variant="outline"
                onClick={onImport}
                className="border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                <Upload className="h-4 w-4" />
                Import from file
              </Button>
            ) : undefined}
            compact
          />
        ) : (
          rows.map((row) => {
            const txnId = getTxnId(row)
            const rowIsIncome = isIncome(row.category)
            const amountMeta = formatAmount(row.amount_kd, rowIsIncome ? "income" : "expense")
            const isSelected = selectedIds?.has(txnId) ?? false
            const primaryLabel = row.merchant || row.name
            const secondaryLabel = row.merchant ? row.name : null

            return (
              <article
                key={row.id}
                className={cn("inner-card space-y-3", isSelected && "border-primary/25 bg-primary/5")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" title={primaryLabel}>
                      {primaryLabel}
                    </div>
                    {secondaryLabel ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={secondaryLabel}>
                        {secondaryLabel}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{row.date}</span>
                      <span className="inline-block h-1 w-1 rounded-full bg-border" />
                      <span>{row.category}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {onToggleSelect ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(txnId)}
                        className="h-4 w-4 rounded border-border accent-primary"
                        aria-label={`Select transaction ${row.name}`}
                      />
                    ) : null}
                    <div className={cn("text-base font-semibold", amountMeta.className)}>
                      {amountMeta.text}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={row.category} />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(txnId)}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Edit
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </div>

      <div className="hidden max-h-[560px] overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="w-10 px-3 py-2.5 text-left">
                {onSelectAll && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onSelectAll(allVisibleIds)}
                    className="h-4 w-4 rounded border-border accent-primary"
                    aria-label="Select all transactions"
                  />
                )}
              </th>
              <th className="th-standard">
                Date
              </th>
              <th className="th-standard">
                Merchant
              </th>
              <th className="th-standard">
                Category
              </th>
              <th className="th-standard">
                Transaction
              </th>
              <th className="th-standard-r">
                Amount
              </th>
              <th className="th-standard-r">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && allRows.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={colSpanFull} className="px-4 py-3">
                    <div className="skeleton h-5" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 && !queryErrorMessage ? (
              <tr>
                <td colSpan={colSpanFull}>
                  <EmptyState
                    icon={<ClipboardList className="h-8 w-8" />}
                    title={emptyState.title}
                    description={emptyState.description}
                    action={onImport && !hasDateFilter ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onImport}
                        className="border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      >
                        <Upload className="h-4 w-4" />
                        Import from file
                      </Button>
                    ) : undefined}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const txnId = getTxnId(row)
                const rowIsIncome = isIncome(row.category)
                const amountMeta = formatAmount(row.amount_kd, rowIsIncome ? "income" : "expense")

                const isSelected = selectedIds?.has(txnId) ?? false

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/60 table-row-hover",
                      isSelected && "bg-primary/5"
                    )}
                  >
                      <td className="w-10 px-3 py-3">
                        {onToggleSelect && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(txnId)}
                            className="h-4 w-4 rounded border-border accent-primary"
                            aria-label={`Select transaction ${row.name}`}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {row.date}
                      </td>
                      <td className="px-4 py-3">
                        {row.merchant || (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={row.category} />
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3" title={row.name}>
                        {row.name}
                      </td>
                      <td className={cn("whitespace-nowrap px-4 py-3 text-right font-medium", amountMeta.className)}>
                        {amountMeta.text}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(txnId)}
                            className="h-8 rounded-full px-3 text-xs"
                          >
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center border-t border-border/40 bg-muted/20 p-3">
          <Button
            variant="ghost"
            size="sm"
            loading={isLoading}
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load more activity"}
          </Button>
        </div>
      )}
    </section>
  )
}

export default TransactionsTable

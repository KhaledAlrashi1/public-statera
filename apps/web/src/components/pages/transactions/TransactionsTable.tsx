import React, { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ClipboardList,
  Upload,
} from "lucide-react"

import { transactionsApi } from "@/lib/api"
import { nameColour } from "@/lib/tile-colours"
import { cn, formatDisplayDate, formatKD } from "@/lib/utils"
import type { Transaction } from "@/types/api"
import { CategoryBadge } from "@/components/ui/category-badge"
import { FilterBar } from "@/components/ui/filter-bar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { useDebounce } from "./helpers"

// MOB-R81 C6 — a row's amount: KD through formatKD, income as "+KD x" in the success colour. Display only.
function rowAmount(row: Transaction): { text: string; className: string } {
  return row.category_counts_as_income
    ? { text: `+${formatKD(row.amount_kd)}`, className: "text-success" }
    : { text: formatKD(row.amount_kd), className: "text-foreground" }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
// MOB-R81 C6 — "Today", else "Sun 4 Oct"; the year is added only when it is not this year.
function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
  const year = m[1] === today.slice(0, 4) ? "" : ` ${y}`
  return `${weekday} ${d} ${MONTHS[mo - 1]}${year}`
}

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
  selecting = false,
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
  /** MOB-R81 C6 — checkboxes show only in Select mode; outside it a row tap edits. */
  selecting?: boolean
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
          // I2 P4: saved income is listed, never counted.
          return row.category_counts_as_income ? sum : sum + amount
        },
        0
      ),
    [rows, transactionType]
  )

  // MOB-R81 C6 — rows by day, newest first (the search is newest first). A day's total uses the rule the
  // "Spent" chip above uses (income rows listed, never counted). Paging appends 20 rows at a time, so the
  // LAST day loaded may continue on the next page: its total is not shown until that day is complete.
  const dayGroups = useMemo(() => {
    const groups: Array<{ date: string; rows: Transaction[]; spent: number; counted: number }> = []
    for (const row of rows) {
      let g = groups[groups.length - 1]
      if (!g || g.date !== row.date) {
        g = { date: row.date, rows: [], spent: 0, counted: 0 }
        groups.push(g)
      }
      g.rows.push(row)
      if (!row.category_counts_as_income) {
        g.spent += parseFloat(row.amount_kd) || 0
        g.counted += 1
      }
    }
    return groups
  }, [rows])
  const today = localToday()

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
          description: "Tap Log to record a purchase in a few seconds.",
        }
      : transactionType === "income"
        ? {
            title: "No income entries yet",
            description: "Log salary and other income to see what comes in.",
          }
        : {
            title: "No transactions yet",
            description: "Every expense and income you log or import lands here.",
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
        variant="plain"
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

        {transactionType !== "income" && (hasDateFilter || rows.length > 0) && total > 0 && (
          <div className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium tabular-nums text-primary">
            {hasMore ? "Spent (loaded)" : "Spent"}: {formatKD(filteredTotal)}
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

      <div className="px-4 pb-2 md:hidden">
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
          dayGroups.map((group, gi) => {
            const complete = gi < dayGroups.length - 1 || !hasMore
            const label = dayLabel(group.date, today)
            return (
              <section key={group.date} aria-label={label} data-testid="activity-day">
                <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <h3>{label}</h3>
                  {transactionType !== "income" && group.counted > 0 && complete ? (
                    <span className="font-mono normal-case tracking-normal tabular-nums" data-testid="activity-day-total">
                      {formatKD(group.spent)}
                    </span>
                  ) : null}
                </div>
                <ul className="divide-y divide-border/50">
                  {group.rows.map((row) => {
                    const txnId = getTxnId(row)
                    const income = row.category_counts_as_income
                    const isSelected = selectedIds?.has(txnId) ?? false
                    // MOB-R82 C3 — the place over its category; with no place, the category over the entry's name
                    // (else nothing); with neither, the name alone.
                    const line1 = row.merchant || row.category || row.name
                    const line2 = row.merchant ? row.category : row.category ? row.name || null : null
                    const amount = rowAmount(row)
                    const rowBody = (
                      <>
                        <span
                          aria-hidden="true"
                          data-testid="activity-row-square"
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold",
                            income ? "bg-muted text-muted-foreground" : cn("text-white", nameColour(line1)),
                          )}
                        >
                          {line1.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{line1}</span>
                          {line2 ? <span className="block truncate text-xs text-muted-foreground">{line2}</span> : null}
                        </span>
                        <span className={cn("shrink-0 font-mono text-sm font-semibold tabular-nums", amount.className)}>
                          {amount.text}
                        </span>
                      </>
                    )
                    return (
                      <li key={row.id}>
                        {selecting && onToggleSelect ? (
                          <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 py-1.5", isSelected && "bg-primary/5")}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleSelect(txnId)}
                              className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                              aria-label={`Select transaction ${row.name}`}
                            />
                            {rowBody}
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onEdit(txnId)}
                            aria-label={`Edit ${line1}, ${amount.text}`}
                            className="flex min-h-12 w-full items-center gap-3 py-1.5 text-start"
                          >
                            {rowBody}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })
        )}
      </div>

      <div className="hidden max-h-[560px] overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="w-10 px-3 py-2.5 text-left">
                {selecting && onSelectAll && (
                  <label className="inline-flex pointer-coarse:-m-3.5 pointer-coarse:p-3.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onSelectAll(allVisibleIds)}
                      className="h-4 w-4 rounded border-border accent-primary"
                      aria-label="Select all transactions"
                    />
                  </label>
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
                const amountMeta = rowAmount(row)

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
                        {selecting && onToggleSelect && (
                          <label className="inline-flex pointer-coarse:-m-3.5 pointer-coarse:p-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleSelect(txnId)}
                              className="h-4 w-4 rounded border-border accent-primary"
                              aria-label={`Select transaction ${row.name}`}
                            />
                          </label>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDisplayDate(row.date)}
                      </td>
                      <td className="px-4 py-3">
                        {row.merchant || (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={row.category} countsAsIncome={row.category_counts_as_income} />
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3" title={row.name}>
                        {row.name}
                      </td>
                      <td className={cn("whitespace-nowrap px-4 py-3 text-right font-mono font-medium tabular-nums", amountMeta.className)}>
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

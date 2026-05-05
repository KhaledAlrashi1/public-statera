import { useEffect, useState } from "react"
import { CalendarDays, Search, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, today } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type FilterOption = { value: string; label: string }

type FilterBarProps = {
  searchValue: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  dateRange?: {
    from: string
    to: string
    onFromChange: (v: string) => void
    onToChange: (v: string) => void
    error?: string | null
  }
  onClear?: () => void
  clearLabel?: string
  mobileCollapsible?: boolean
  mobileButtonLabel?: string
  filters?: {
    value: string
    onChange: (v: string) => void
    options: FilterOption[]
    placeholder?: string
    width?: string
  }[]
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  dateRange,
  onClear,
  clearLabel = "Clear",
  mobileCollapsible = false,
  mobileButtonLabel = "Filters",
  filters = [],
}: FilterBarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const hasAdvancedControls = filters.length > 0 || Boolean(dateRange) || Boolean(onClear)
  const activeAdvancedCount =
    filters.filter((filter) => filter.value && filter.value !== "all" && filter.value !== "__all__").length
    + (dateRange?.from || dateRange?.to ? 1 : 0)
  const hasActiveAdvancedControls =
    activeAdvancedCount > 0

  useEffect(() => {
    if (hasActiveAdvancedControls) {
      setShowMobileFilters(true)
    }
  }, [hasActiveAdvancedControls])

  return (
    <div className="px-4 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-inner)] border border-border/60 bg-card p-3 shadow-[var(--shadow-level-1)]">
        <div className="flex min-w-[220px] flex-1 basis-[260px] items-center gap-2 rounded-[var(--radius-input)] border border-border/70 bg-background px-3 py-2.5 text-sm shadow-sm transition-colors focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15">
          <Search className="icon-inline text-muted-foreground" />
          <input
            type="text"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {mobileCollapsible && hasAdvancedControls ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMobileFilters((prev) => !prev)}
            className={cn(
              "h-9 rounded-full border-border/70 bg-muted/40 px-3 text-xs font-medium sm:hidden",
              (showMobileFilters || hasActiveAdvancedControls) && "border-primary/30 bg-primary/10 text-primary shadow-sm"
            )}
            aria-expanded={showMobileFilters}
          >
            <SlidersHorizontal className="icon-inline" />
            <span>{mobileButtonLabel}</span>
            {activeAdvancedCount > 0 ? (
              <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {activeAdvancedCount}
              </span>
            ) : null}
          </Button>
        ) : null}

        <div
          className={`w-full flex-wrap items-center gap-3 sm:w-auto ${
            mobileCollapsible && hasAdvancedControls
              ? showMobileFilters ? "flex" : "hidden sm:flex"
              : "flex"
          }`}
        >
          {filters.map((f, i) => (
            <Select key={i} value={f.value} onValueChange={f.onChange}>
              <SelectTrigger
                className={cn(
                  "h-9 border-border/70 bg-background px-3 text-sm shadow-sm",
                  f.width ?? "w-[140px]"
                )}
              >
                <SelectValue placeholder={f.placeholder ?? "All"} />
              </SelectTrigger>
              <SelectContent>
                {f.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {dateRange && (
            <div className="grid gap-1">
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] border border-border/70 bg-background px-2.5 py-1.5 shadow-sm",
                  dateRange.error && "border-destructive/45 bg-destructive/5"
                )}
              >
                <CalendarDays className="icon-inline text-muted-foreground" />
                <input
                  type="date"
                  value={dateRange.from}
                  max={dateRange.to || today()}
                  onChange={(e) => dateRange.onFromChange(e.target.value)}
                  aria-invalid={Boolean(dateRange.error)}
                  className="h-8 w-[136px] rounded-[var(--radius-input)] bg-transparent px-2 text-sm focus-visible:outline-none"
                  title="From date"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  type="date"
                  value={dateRange.to}
                  min={dateRange.from || undefined}
                  max={today()}
                  onChange={(e) => dateRange.onToChange(e.target.value)}
                  aria-invalid={Boolean(dateRange.error)}
                  className="h-8 w-[136px] rounded-[var(--radius-input)] bg-transparent px-2 text-sm focus-visible:outline-none"
                  title="To date"
                />
              </div>
              {dateRange.error ? (
                <p className="px-1 text-xs text-destructive">{dateRange.error}</p>
              ) : null}
            </div>
          )}
          {onClear ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="h-9 rounded-full border-border/70 bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {clearLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

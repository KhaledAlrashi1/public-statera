import * as React from "react"
import { cn } from "@/lib/utils"

/** Normalize a raw money string to 3-decimal KWD form. Empty stays empty. */
function normalizeMoney(raw: string): string {
  const cleaned = raw.replace(/,/g, "").trim()
  if (cleaned === "" || cleaned === ".") return ""
  const n = parseFloat(cleaned)
  if (Number.isNaN(n)) return ""
  return n.toFixed(3)
}

/** Permissive while-typing filter: strip commas, keep digits + one dot, cap 3 decimals. */
function filterMoneyInput(raw: string): string {
  let s = raw.replace(/,/g, "").replace(/[^\d.]/g, "")
  const firstDot = s.indexOf(".")
  if (firstDot !== -1) {
    const intPart = s.slice(0, firstDot)
    const fracPart = s.slice(firstDot + 1).replace(/\./g, "").slice(0, 3)
    s = `${intPart}.${fracPart}`
  }
  return s
}

export interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string
  onValueChange: (value: string) => void
  /** Render the muted "KD" prefix inside the field. Default true. */
  showCurrency?: boolean
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    { value, onValueChange, showCurrency = true, className, placeholder = "0.000", onBlur, ...props },
    ref
  ) => (
    <div className="relative">
      {showCurrency ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sm text-muted-foreground"
        >
          KD
        </span>
      ) : null}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(filterMoneyInput(e.target.value))}
        onBlur={(e) => {
          const normalized = normalizeMoney(e.target.value)
          if (normalized !== value) onValueChange(normalized)
          onBlur?.(e)
        }}
        className={cn(
          "money-input flex h-11 w-full rounded-[var(--radius-input)] border border-input bg-card py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          showCurrency ? "ps-10 pe-3" : "ps-3 pe-3",
          className
        )}
        {...props}
      />
    </div>
  )
)
MoneyInput.displayName = "MoneyInput"

export { MoneyInput }

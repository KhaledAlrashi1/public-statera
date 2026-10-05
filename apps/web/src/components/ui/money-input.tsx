import * as React from "react"
import { cn } from "@/lib/utils"
import { AMOUNT_REFUSED_MESSAGE, formatAmountReadout, parseAmountText } from "@/lib/amount-text"

/**
 * The value a parent receives while typing: the text read by the normalizer ("1,5" -> "1.5"), or
 * "" while empty or unreadable. On blur the parent receives the exact 3-decimal value, as before.
 */
function emittedValue(raw: string): string {
  const parsed = parseAmountText(raw)
  return parsed.kind === "ok" ? parsed.clean : ""
}

function blurredValue(raw: string): string {
  const parsed = parseAmountText(raw)
  return parsed.kind === "ok" ? parsed.kd : ""
}

export interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string
  onValueChange: (value: string) => void
  /** Render the muted "KD" prefix inside the field. Default true. */
  showCurrency?: boolean
  /** Extra classes for the "KD" prefix span — e.g. scale it up on a hero field. */
  currencyClassName?: string
}

// MOB-R62 E / RM-27 — the box keeps the text exactly as typed and reads it through the one
// normalizer (lib/amount-text): the parent receives the normalized text while typing and the exact
// 3-decimal string on blur, or "" while the box is empty or unreadable, and a readout under the box
// shows the value that will be saved (or why nothing will). Nothing typed is stripped or truncated
// silently.
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    { value, onValueChange, showCurrency = true, currencyClassName, className, placeholder = "0.000", onBlur, ...props },
    ref
  ) => {
    const [text, setText] = React.useState(value)
    // The last value this box sent up. A different incoming value was set by the parent (a
    // prefill, a reset), so the box shows it; the box's own echo leaves the typed text alone.
    const lastEmitted = React.useRef(value)
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      if (emittedValue(text) !== value) setText(value)
    }

    const emit = (raw: string) => {
      setText(raw)
      const next = emittedValue(raw)
      lastEmitted.current = next
      if (next !== value) onValueChange(next)
    }

    const parsed = parseAmountText(text)
    return (
      <div>
        <div className="relative">
          {showCurrency ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sm text-muted-foreground",
                currencyClassName
              )}
            >
              KD
            </span>
          ) : null}
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            onChange={(e) => emit(e.target.value)}
            onBlur={(e) => {
              if (parsed.kind === "ok") setText(parsed.kd)
              else if (parsed.kind === "empty") setText("")
              const next = blurredValue(text)
              if (next !== value) {
                lastEmitted.current = next
                onValueChange(next)
              }
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
        {parsed.kind === "empty" ? null : (
          <p
            aria-live="polite"
            data-testid="money-input-readout"
            className={cn("mt-1 text-xs tabular-nums", parsed.kind === "refused" ? "text-destructive" : "text-muted-foreground")}
          >
            {parsed.kind === "ok" ? formatAmountReadout(parsed.kd) : AMOUNT_REFUSED_MESSAGE}
          </p>
        )}
      </div>
    )
  }
)
MoneyInput.displayName = "MoneyInput"

export { MoneyInput }

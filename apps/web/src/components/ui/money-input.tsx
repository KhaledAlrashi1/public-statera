import * as React from "react"
import { cn } from "@/lib/utils"
import {
  AMOUNT_REFUSED_MESSAGE,
  caretAfterRegroup,
  formatAmountReadout,
  groupedKd,
  parseAmountText,
  regroupTyped,
} from "@/lib/amount-text"

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
  /** MOB-R105 D1 — show the whole part grouped ("1,500.000") as she types and at rest. Default false. */
  grouped?: boolean
  /** The line under the box repeating the value that will be saved. Default true. The line saying the
   *  text cannot be read shows either way. */
  echo?: boolean
}

// MOB-R62 E / RM-27 — the box keeps the text exactly as typed and reads it through the one
// normalizer (lib/amount-text): the parent receives the normalized text while typing and the exact
// 3-decimal string on blur, or "" while the box is empty or unreadable, and a readout under the box
// shows the value that will be saved (or why nothing will). Nothing typed is stripped or truncated
// silently.
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      onValueChange,
      showCurrency = true,
      currencyClassName,
      grouped = false,
      echo = true,
      className,
      placeholder = "0.000",
      onBlur,
      ...props
    },
    ref
  ) => {
    const shown = (v: string) => (grouped ? groupedKd(v) : v)
    const [text, setText] = React.useState(() => shown(value))
    // MOB-R105 D1 — whether the commas in the text are the box's own (so it may move them).
    const owned = React.useRef(true)
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const pendingCaret = React.useRef<number | null>(null)
    React.useLayoutEffect(() => {
      if (pendingCaret.current !== null && inputRef.current) {
        inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
        pendingCaret.current = null
      }
    })
    const setRefs = (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    }
    // The last value this box sent up. A different incoming value was set by the parent (a
    // prefill, a reset), so the box shows it; the box's own echo leaves the typed text alone.
    const lastEmitted = React.useRef(value)
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      if (emittedValue(text) !== value) {
        setText(shown(value))
        owned.current = true
      }
    }

    const emit = (raw: string, caret: number | null) => {
      let next = raw
      if (grouped) {
        const step = regroupTyped(text, owned.current, raw)
        owned.current = step.owned
        next = step.text
        if (caret !== null && next !== raw) pendingCaret.current = caretAfterRegroup(raw, caret, next)
      }
      setText(next)
      const out = emittedValue(next)
      lastEmitted.current = out
      if (out !== value) onValueChange(out)
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
            ref={setRefs}
            type="text"
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            onChange={(e) => emit(e.target.value, e.target.selectionStart)}
            onBlur={(e) => {
              if (parsed.kind === "ok") {
                setText(shown(parsed.kd))
                owned.current = true
              } else if (parsed.kind === "empty") setText("")
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
        {parsed.kind === "empty" || (parsed.kind === "ok" && !echo) ? null : (
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

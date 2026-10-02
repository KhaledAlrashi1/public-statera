import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TransactionSuggestion } from "@/types/api"

interface SuggestionComboboxProps {
  id: string
  label: string
  placeholder?: string
  value: string
  /** Raw text edits (does not fetch). */
  onValueChange: (v: string) => void
  suggestions: TransactionSuggestion[]
  /** Fire the suggestions query. */
  onFetch: (q: string) => void
  /** Apply the picked suggestion to the form. */
  onSelect: (s: TransactionSuggestion) => void
  /** Called after a suggestion is accepted — e.g. move focus to the save button. */
  onAfterSelect?: () => void
  /** Reports panel open/close so the parent dialog can gate its Escape handler. */
  onOpenChange?: (open: boolean) => void
  invalid?: boolean
  className?: string
  /** FieldFeedback node rendered under the input. */
  feedback?: ReactNode
  /**
   * Constant suggestions listed after the user's own (MOB-R46: suggested merchants). The parent
   * filters them against the typed text; picking one calls onSelectExtra, not onSelect.
   */
  extraOptions?: readonly ExtraOption[]
  onSelectExtra?: (option: ExtraOption) => void
}

export type ExtraOption = { name: string; detail?: string }

const NO_EXTRAS: readonly ExtraOption[] = []

/**
 * Shared merchant/name autocomplete field. Full combobox ARIA (role=combobox on
 * the input, role=listbox/option on the panel) with a roving highlight. The top
 * option is highlighted whenever the panel opens, so the keyboard path is
 * type → Enter (accepts top) → Enter (submits). Escape closes the panel and
 * stops propagation so the Radix dialog's own Escape handler does not also fire.
 */
export const SuggestionCombobox = forwardRef<HTMLInputElement, SuggestionComboboxProps>(
  function SuggestionCombobox(
    {
      id,
      label,
      placeholder,
      value,
      onValueChange,
      suggestions,
      onFetch,
      onSelect,
      onAfterSelect,
      onOpenChange,
      invalid,
      className,
      feedback,
      extraOptions = NO_EXTRAS,
      onSelectExtra,
    },
    ref,
  ) {
    const [open, setOpen] = useState(false)
    const [highlighted, setHighlighted] = useState(0)
    const listboxId = useId()
    const optionId = (i: number) => `${listboxId}-opt-${i}`
    const total = suggestions.length + extraOptions.length
    // A string key, so a parent that rebuilds the extras array each render does not reset the highlight.
    const extrasKey = extraOptions.map((o) => o.name).join("\u0000")

    // Re-highlight the top row whenever the option set changes.
    useEffect(() => {
      setHighlighted(0)
    }, [suggestions, extrasKey])

    // Report open/close to the parent (for dialog-level Escape gating) without
    // re-subscribing on every render.
    const onOpenChangeRef = useRef(onOpenChange)
    onOpenChangeRef.current = onOpenChange
    useEffect(() => {
      onOpenChangeRef.current?.(open)
    }, [open])

    const accept = (s: TransactionSuggestion) => {
      onSelect(s)
      setOpen(false)
      onAfterSelect?.()
    }

    const acceptExtra = (o: ExtraOption) => {
      onSelectExtra?.(o)
      setOpen(false)
      onAfterSelect?.()
    }

    const acceptAt = (i: number) => {
      if (i < suggestions.length) accept(suggestions[i])
      else acceptExtra(extraOptions[i - suggestions.length])
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!open && total) setOpen(true)
        setHighlighted((h) => Math.min(h + 1, total - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
      } else if (e.key === "Enter") {
        if (open && total > 0 && highlighted >= 0) {
          e.preventDefault()
          acceptAt(highlighted)
        }
        // otherwise: let the surrounding <form> submit natively
      } else if (e.key === "Escape") {
        if (open) {
          // Just close the panel. The dialog gates its own Radix Escape handler on
          // our reported open state (Radix's Escape fires in the capture phase, so it
          // can't be stopped from here — see the dialog's onEscapeKeyDown).
          setOpen(false)
        }
        // otherwise: let Radix close the dialog
      }
    }

    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <Input
            id={id}
            ref={ref}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={open && total ? optionId(highlighted) : undefined}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              const next = e.target.value
              onValueChange(next)
              if (next.trim().length >= 2) {
                onFetch(next)
                setOpen(true)
              } else {
                setOpen(false)
              }
            }}
            onFocus={() => {
              if (total) setOpen(true)
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleKeyDown}
            aria-invalid={invalid}
            className={className}
          />
          {feedback}
          {open ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
            >
              {total === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No suggestions</li>
              ) : (
                suggestions.map((s, i) => (
                  <li
                    key={`${s.name}-${s.merchant?.name ?? ""}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === highlighted}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseDown={(e) => {
                      // preventDefault keeps focus on the input so onAfterSelect can move it deliberately
                      e.preventDefault()
                      accept(s)
                    }}
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-sm",
                      i === highlighted ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.category?.name}
                      {s.merchant?.name ? ` · ${s.merchant.name}` : ""}
                    </span>
                  </li>
                ))
              )}
              {extraOptions.map((o, j) => {
                const i = suggestions.length + j
                return (
                  <li
                    key={`extra-${o.name}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === highlighted}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      acceptExtra(o)
                    }}
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-sm",
                      i === highlighted ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-medium">{o.name}</span>
                    {o.detail ? <span className="text-xs text-muted-foreground">{o.detail}</span> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    )
  },
)

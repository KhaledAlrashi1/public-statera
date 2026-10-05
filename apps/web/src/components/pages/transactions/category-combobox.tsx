import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"
import { categoryOptions } from "@/lib/suggested-names"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CategoryComboboxProps {
  id: string
  value: string
  onValueChange: (v: string) => void
  /** The user's own category names; suggested names they do not own follow them. */
  categories: string[]
  /** Reports panel open/close so the parent dialog can gate its Escape handler. */
  onOpenChange?: (open: boolean) => void
  /** MOB-R60 D1 — the user owns a savings-kind category (server kind); hides the generic entry. */
  ownsSavingsCategory?: boolean
}

/**
 * Pick-or-type category field (MOB-R46). Focus shows every option — the user's own categories
 * first, then the suggested names — and typing filters them. Any typed name is accepted as-is: the
 * row is created on save by the server's getOrCreateCategory, never here. Nothing is highlighted
 * until the user types or arrows, so Enter on an untouched field submits rather than picking.
 */
export function CategoryCombobox({ id, value, onValueChange, categories, onOpenChange, ownsSavingsCategory = false }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(-1)
  const listboxId = useId()
  const optionId = (i: number) => `${listboxId}-opt-${i}`

  const q = query.trim().toLowerCase()
  const options = categoryOptions(categories, ownsSavingsCategory).filter((name) => !q || name.toLowerCase().includes(q))
  const isNewName = Boolean(q) && !options.some((name) => name.toLowerCase() === q)

  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  useEffect(() => {
    onOpenChangeRef.current?.(open)
  }, [open])

  const accept = (name: string) => {
    onValueChange(name)
    setOpen(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setHighlighted((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && highlighted >= 0 && highlighted < options.length) {
        e.preventDefault()
        accept(options[highlighted])
      }
      // otherwise: let the surrounding <form> submit with the typed name
    } else if (e.key === "Escape") {
      if (open) setOpen(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Category</Label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlighted >= 0 ? optionId(highlighted) : undefined}
          autoComplete="off"
          placeholder="Pick or type a category"
          value={value}
          onChange={(e) => {
            const next = e.target.value
            onValueChange(next)
            setQuery(next)
            setHighlighted(next.trim() ? 0 : -1)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery("")
            setHighlighted(-1)
            setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-2 max-h-60 max-sm:max-h-[min(15rem,40dvh)] w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
          >
            {isNewName ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                New category “{query.trim()}” — added when you save.
              </li>
            ) : null}
            {options.map((name, i) => (
              <li
                key={name}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlighted}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  // preventDefault keeps focus on the input
                  e.preventDefault()
                  accept(name)
                }}
                className={cn(
                  "cursor-pointer px-3 py-2.5 text-sm pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center",
                  i === highlighted ? "bg-muted" : "hover:bg-muted",
                )}
              >
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

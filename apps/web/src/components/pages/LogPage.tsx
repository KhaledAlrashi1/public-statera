// MOB-R53 Part B — v5 manual logging, "Place, then item", on the route /log. MOB-R61 D2 made it the
// main expense entry (the FAB and "L" for an expense, the palette's "Add Expense", Activity's add on
// a non-income view); income keeps QuickAdd. Strings stay provisional until a ruling after the
// Friday test (RM-26, D5). Mounted inside ProtectedRoute but OUTSIDE AppShell, so neither the FAB
// nor the bottom tabs cover the keypad — without touching either.
//
// Money is a STRING end to end (B3): the keypad builds a string (lib/log-amount), the API gets the
// normalised 3-decimal string, and the batch total is summed in integer fils. Display goes through
// the app's existing formatKD.
//
// Saves go through the existing POST /api/transactions, as QuickAdd's does. Undo calls the existing
// DELETE only with the id this page's own most recent create returned in this page session.
// After a save or an undo every query is invalidated (MOB-R55 G3: no key list, so it cannot drift).
// Test stats are local only: sessionStorage, shown at /log?stats=1, never sent anywhere.
import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Delete, Search } from "lucide-react"
import { ApiError, categoriesApi, transactionsApi } from "@/lib/api"
import { cn, formatDisplayDate, formatKD } from "@/lib/utils"
import { normalizeAmount, pressDecimal, pressDelete, pressDigit, sumKd } from "@/lib/log-amount"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toaster"
import type { LogSuggestionItem, LogSuggestionPlace } from "@/types/api"
import { GENERIC_SAVINGS_CATEGORY } from "@/lib/suggested-names"
import { AMOUNT_REFUSED_MESSAGE, formatAmountReadout, parseAmountText } from "@/lib/amount-text"
import { searchableCategoryNames, usualCategoryNames } from "@/lib/log-categories"
import { useFinePointer } from "@/lib/use-pointer"
import { useVisualViewportVars, VISUAL_VIEWPORT_SHEET_CLASS } from "@/lib/useVisualViewport"

export const LOG_STATS_KEY = "statera.log.stats"

/** Beginner list, shown only while the user has no places of their own (B3). */
export const POPULAR_IN_KUWAIT: ReadonlyArray<{ name: string; category: string }> = [
  { name: "PICK", category: "Coffee" },
  { name: "Starbucks", category: "Coffee" },
  { name: "Sultan Center", category: "Groceries" },
  { name: "Talabat", category: "Food Delivery" },
  { name: "Oula", category: "Fuel" },
  { name: "Careem", category: "Transport" },
]

type Saved = { id: number; amount: string; what: string }
type StatEntry = { ms: number; taps: number; suggestion: boolean }

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function readStats(): StatEntry[] {
  try {
    const raw = window.sessionStorage.getItem(LOG_STATS_KEY)
    return raw ? (JSON.parse(raw) as StatEntry[]) : []
  } catch {
    return []
  }
}

function writeStats(entries: StatEntry[]) {
  try {
    window.sessionStorage.setItem(LOG_STATS_KEY, JSON.stringify(entries))
  } catch {
    /* storage unavailable: stats are a local convenience only */
  }
}

const chip =
  "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"

export default function LogPage() {
  const [params] = useSearchParams()
  if (params.get("stats") === "1") {
    return <pre className="mx-auto max-w-[28rem] whitespace-pre-wrap p-4 text-xs">{JSON.stringify(readStats(), null, 2)}</pre>
  }
  return <LogPanel />
}

function LogPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const queryClient = useQueryClient()

  const today = useMemo(() => new Date(), [])
  const todayIso = localIso(today)
  const yesterdayIso = localIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))

  const { data: places = [], isSuccess: placesLoaded } = useQuery({
    queryKey: ["log-suggestions"],
    queryFn: transactionsApi.logSuggestions,
  })
  const { data: categoryList = [] } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list })

  const [date, setDate] = useState(todayIso)
  // MOB-R69 E4 — computers type the amount; touch devices keep the keypad.
  const fine = useFinePointer()
  const [place, setPlace] = useState<string | null>(null)
  const [placeItems, setPlaceItems] = useState<LogSuggestionItem[]>([])
  const [item, setItem] = useState<string | null>(null)
  const [other, setOther] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [prefilled, setPrefilled] = useState(false)
  const [forceNext, setForceNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Saved[]>([])
  const [lastCreatedId, setLastCreatedId] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState("")

  const stat = useRef<{ start: number | null; taps: number; suggestion: boolean }>({ start: null, taps: 0, suggestion: false })
  const tap = (fromSuggestion = false) => {
    if (stat.current.start === null) stat.current.start = Date.now()
    stat.current.taps += 1
    if (fromSuggestion) stat.current.suggestion = true
  }
  // Any change to the entry means a later Save is a different entry: no force carried over.
  const changed = () => {
    setForceNext(false)
    setError(null)
  }

  const beginner = placesLoaded && places.length === 0
  const listedPlaces: Array<{ name: string; category: string | null; items: LogSuggestionItem[] }> = beginner
    ? POPULAR_IN_KUWAIT.map((p) => ({ ...p, items: [] }))
    : places

  const itemName = other?.trim() || item
  const what = itemName && place ? `${itemName} at ${place}` : itemName || place || category || ""
  const normalized = prefilled ? amount : normalizeAmount(amount)
  // MOB-R69 E4 — the readout shows what will save, through the RM-27 normalizer; refused text is
  // shown as typed, with the refusal line, and cannot be saved (normalized is null).
  const parsed = prefilled ? null : parseAmountText(amount)
  const amountRefused = parsed?.kind === "refused"
  const readout = prefilled
    ? formatAmountReadout(amount)
    : parsed?.kind === "ok"
      ? formatAmountReadout(parsed.kd)
      : parsed?.kind === "refused"
        ? `KD ${amount}`
        : "KD 0"

  const pickPlace = (p: { name: string; category: string | null; items: LogSuggestionItem[] }, fromSuggestion: boolean) => {
    tap(fromSuggestion)
    changed()
    setPlace(p.name)
    setPlaceItems(p.items)
    setItem(null)
    setOther(null)
    if (p.category) setCategory(p.category)
  }

  const pickItem = (it: LogSuggestionItem) => {
    tap(true)
    changed()
    setItem(it.name)
    setOther(null)
    if (it.category) setCategory(it.category)
    setAmount(it.amount_kd)
    setPrefilled(true)
  }

  const key = (k: string) => {
    tap()
    changed()
    const base = prefilled ? "" : amount
    setPrefilled(false)
    if (k === "del") setAmount(prefilled ? "" : pressDelete(base))
    else if (k === ".") setAmount(pressDecimal(base))
    else setAmount(pressDigit(base, k))
  }

  // MOB-R69 E4 — a key from a physical keyboard. "," is kept as typed; the normalizer reads it.
  const typeChar = (k: string) => {
    tap()
    changed()
    const base = prefilled ? "" : amount
    setPrefilled(false)
    if (k === ",") setAmount(`${base},`)
    else if (k === ".") setAmount(pressDecimal(base))
    else setAmount(pressDigit(base, k))
  }

  const resetEntry = () => {
    setPlace(null)
    setPlaceItems([])
    setItem(null)
    setOther(null)
    setCategory(null)
    setAmount("")
    setPrefilled(false)
    setForceNext(false)
    stat.current = { start: null, taps: 0, suggestion: false }
  }

  const save = async () => {
    if (!normalized || !category) return
    tap()
    setSaving(true)
    setError(null)
    try {
      const res = await transactionsApi.create({
        date,
        merchant: place ?? undefined,
        category,
        name: itemName || place || category,
        amount_kd: normalized,
        force: forceNext ? "1" : undefined,
      })
      const id = res.data?.item?.id
      if (typeof id === "number") setLastCreatedId(id)
      setSaved((s) => [...s, { id: typeof id === "number" ? id : -1, amount: normalized, what }])
      writeStats([
        ...readStats(),
        { ms: Date.now() - (stat.current.start ?? Date.now()), taps: stat.current.taps, suggestion: stat.current.suggestion },
      ])
      void queryClient.invalidateQueries()
      resetEntry()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Already saved for this date. Tap Save again to keep both.")
        setForceNext(true)
      } else {
        setError("Couldn't save. Check your connection and try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  const undo = async () => {
    const id = lastCreatedId
    if (id === null) return
    setLastCreatedId(null)
    try {
      await transactionsApi.delete(id)
      setSaved((s) => s.filter((e) => e.id !== id))
      void queryClient.invalidateQueries()
    } catch {
      setLastCreatedId(id)
      // MOB-R56 D4 (S16) — not S14: after a failed undo the entry is still saved.
      setError("Couldn't undo. The entry is still saved.")
    }
  }

  // MOB-R61 D3 — the way back to where the user came from; a /log opened directly (no in-app
  // history entry) goes Home instead of leaving the app.
  const goBack = () => {
    if (location.key !== "default") navigate(-1)
    else navigate("/")
  }

  const done = () => {
    if (saved.length > 0) {
      toast.success(`${saved.length} saved · ${formatKD(sumKd(saved.map((s) => s.amount)))}`)
      navigate("/activity")
    } else {
      navigate(-1)
    }
  }

  const canSave = Boolean(normalized && category && !saving)

  // MOB-R69 E4 — digits, ".", "," and Backspace from a physical keyboard, on every device. Enter
  // saves only when Save is enabled. Ignored while any text field has focus (that field owns its
  // keys; on computers the amount field types natively) and while a picker is open.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const isField = (node: EventTarget | Element | null) => {
      const n = node as HTMLElement | null
      return Boolean(n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable))
    }
    // Both the focused element and the event's own target: a key typed in a field (including the
    // computer's amount field, which handles its own Enter) never reaches this handler twice.
    if (isField(document.activeElement) || isField(e.target)) return
    if (searchOpen || categoryOpen) return
    if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",") {
      e.preventDefault()
      typeChar(e.key)
    } else if (e.key === "Backspace") {
      e.preventDefault()
      key("del")
    } else if (e.key === "Enter" && canSave) {
      e.preventDefault()
      void save()
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // MOB-R69 D3/E3 (b) — /log's two pickers follow the visual viewport like the old sheet, and the
  // focused field is revealed after the keyboard resizes them.
  const revealFocused = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" })
  }
  const searchVv = useVisualViewportVars(searchOpen, revealFocused)
  const categoryVv = useVisualViewportVars(categoryOpen, revealFocused)
  // E3 (a) — on touch devices no field takes focus when a picker opens, so no keyboard appears
  // until she taps the search field. Computers keep the focus.
  const keepKeyboardDown = (e: Event) => {
    if (!fine) e.preventDefault()
  }

  const q = query.trim().toLowerCase()
  const placeResults = q ? listedPlaces.filter((p) => p.name.toLowerCase().includes(q)) : []
  const itemResults = q
    ? listedPlaces.flatMap((p) => p.items.filter((i) => i.name.toLowerCase().includes(q)).map((i) => ({ place: p, item: i })))
    : []
  const exactPlace = listedPlaces.some((p) => p.name.toLowerCase() === q)

  const cq = categoryQuery.trim().toLowerCase()
  // MOB-R59 D1/E9 (provisional, RM-26) — the generic savings entry follows the user's own
  // categories unless they own a savings-kind one (server kind) or already have the name. Picking it
  // only sets the name; the row is created on save by the server (getOrCreateCategory).
  // MOB-R69 E3 (c)/(d) — before typing: up to six of her categories by her own use (lib/
  // log-categories); typing searches the full list. Income-kind categories are never offered here.
  const ownedNames = categoryList.map((c) => c.name)
  const ownsSavingsCategory = categoryList.some((c) => c.kind === "savings")
  const offerGenericSavings =
    !ownsSavingsCategory && !ownedNames.some((n) => n.toLowerCase() === GENERIC_SAVINGS_CATEGORY.toLowerCase())
  const withGeneric = (names: string[]) => (offerGenericSavings ? [...names, GENERIC_SAVINGS_CATEGORY] : names)
  const categoryNames = withGeneric(searchableCategoryNames(categoryList))
  const categoryResults = cq
    ? categoryNames.filter((n) => n.toLowerCase().includes(cq))
    : withGeneric(usualCategoryNames(categoryList))
  const exactCategory = categoryNames.some((n) => n.toLowerCase() === cq) || ownedNames.some((n) => n.toLowerCase() === cq)

  const hint = prefilled && item
    ? `Usual price for ${item}. Type to change it.`
    : saved.length > 0
      ? "Date stays set while you log several."
      : "Tap a place, then type the amount."

  const saveLabel = !normalized
    ? "Enter an amount"
    : !category
      ? "Pick a place or category"
      : `Save ${formatKD(normalized)} · ${what}`

  const last = saved[saved.length - 1]

  return (
    // MOB-R69 E1 — at least 16px from both edges, plus the safe-area insets (notch, home bar).
    <div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col gap-4 bg-background ps-[calc(1rem+env(safe-area-inset-left))] pe-[calc(1rem+env(safe-area-inset-right))] pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {/* Date */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" className="min-h-11 min-w-11 px-2" aria-label="Back" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button type="button" className={chip} aria-pressed={date === todayIso} onClick={() => { tap(); changed(); setDate(todayIso) }}>
          Today
        </button>
        <button type="button" className={chip} aria-pressed={date === yesterdayIso} onClick={() => { tap(); changed(); setDate(yesterdayIso) }}>
          Yesterday
        </button>
        {/* MOB-R69 E2 — one tap opens the date picker. The real date field lies over the chip,
            transparent, so the tap lands on it (iPhone opens its picker on that tap); on computers
            showPicker() opens the calendar from anywhere on the chip. */}
        <span
          className={cn(
            chip,
            "relative",
            date !== todayIso && date !== yesterdayIso && "border-primary bg-primary text-primary-foreground"
          )}
        >
          {/* MOB-R56 D3 — the app's existing date formatter (utils.ts formatDisplayDate). */}
          <span aria-hidden="true">{date !== todayIso && date !== yesterdayIso ? formatDisplayDate(date) : "Pick a date"}</span>
          <input
            type="date"
            aria-label="Pick a date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={date}
            max={todayIso}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.()
              } catch {
                /* not allowed here: the field's own tap behaviour applies */
              }
            }}
            onChange={(e) => { tap(); changed(); if (e.target.value) setDate(e.target.value) }}
          />
        </span>
        <Button type="button" variant="outline" className="ms-auto min-h-11 min-w-11" aria-label="Search places and items" onClick={() => setSearchOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Places */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{beginner ? "Popular in Kuwait" : "Your usual places"}</h2>
        <div className="flex flex-wrap gap-2">
          {listedPlaces.map((p) => (
            <button
              key={p.name}
              type="button"
              className={cn(chip, "flex-col items-start justify-center py-1")}
              aria-pressed={place === p.name}
              onClick={() => pickPlace(p, true)}
            >
              <span>{p.name}</span>
              {p.category ? (
                <span className="text-xs opacity-75">
                  {p.items.length > 0 ? `${p.category} · ${p.items.length} usual` : p.category}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* Items */}
      <section className="space-y-2">
        {!place ? (
          <p className="text-sm text-muted-foreground">Pick a place to see what you usually buy there.</p>
        ) : (
          <>
            {placeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">What was it? Optional. Your usuals appear here.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {placeItems.map((it) => (
                <button key={it.name} type="button" className={chip} aria-pressed={item === it.name && other === null} onClick={() => pickItem(it)}>
                  {it.name}
                </button>
              ))}
              {other === null ? (
                <button type="button" className={chip} aria-pressed={false} onClick={() => { tap(); changed(); setItem(null); setOther("") }}>
                  + Other
                </button>
              ) : (
                <Input
                  autoFocus
                  aria-label="What was it?"
                  placeholder="What was it?"
                  value={other}
                  onChange={(e) => { changed(); setOther(e.target.value) }}
                  className="min-h-11 w-48"
                />
              )}
            </div>
          </>
        )}
      </section>

      {/* Category */}
      <div>
        <button type="button" className={chip} aria-pressed={category !== null} onClick={() => { tap(); setCategoryOpen(true) }}>
          {category ?? "Category"}
        </button>
      </div>

      {/* Amount + keypad */}
      <div className="space-y-2">
        {fine ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Amount (KD)"
            placeholder="0.000"
            value={amount}
            onFocus={(e) => { if (prefilled) e.currentTarget.select() }}
            onChange={(e) => { tap(); changed(); setPrefilled(false); setAmount(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault()
                void save()
              }
            }}
            className={cn(
              "w-full rounded-[var(--radius-input)] border border-input bg-card px-3 py-2 text-end font-mono text-3xl font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              prefilled && "text-muted-foreground"
            )}
          />
        ) : null}
        <div
          className={cn(
            "text-end font-mono font-semibold tabular-nums",
            fine ? "text-sm text-muted-foreground" : "text-3xl",
            !fine && prefilled && "text-muted-foreground"
          )}
          data-testid="log-amount"
        >
          {readout}
        </div>
        {amountRefused ? <p className="text-end text-sm text-destructive">{AMOUNT_REFUSED_MESSAGE}</p> : null}
        <p className="text-sm text-muted-foreground">{hint}</p>
        {fine ? null : (
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
              <button
                key={k}
                type="button"
                className="min-h-14 rounded-[var(--radius-card)] border border-border bg-card text-xl font-semibold"
                aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : undefined}
                onClick={() => key(k)}
              >
                {k === "del" ? <Delete className="mx-auto h-5 w-5" /> : k}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <Button type="button" className="min-h-12" disabled={!canSave} onClick={() => void save()}>
        {saveLabel}
      </Button>

      {last ? (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{`${saved.length} saved · ${formatKD(sumKd(saved.map((s) => s.amount)))} · last: ${last.what}`}</span>
          {lastCreatedId !== null ? (
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void undo()}>
              Undo last
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button type="button" variant="outline" className="min-h-11" onClick={done}>
        Done
      </Button>

      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setQuery("") }}>
        <DialogContent className={cn("space-y-4", VISUAL_VIEWPORT_SHEET_CLASS)} style={searchVv} onOpenAutoFocus={keepKeyboardDown}>
          <DialogHeader className="pe-10">
            <DialogTitle>Place or item</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Search places and items"
            placeholder="Try “americano” or “pick”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-1 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto">
            {placeResults.map((p) => (
              <button key={`p-${p.name}`} type="button" className="block min-h-11 w-full rounded-lg px-3 py-2 text-start hover:bg-muted" onClick={() => { pickPlace(p, true); setSearchOpen(false); setQuery("") }}>
                <span className="block font-medium">{p.name}</span>
                {p.category ? <span className="block text-xs text-muted-foreground">{p.category}</span> : null}
              </button>
            ))}
            {itemResults.map(({ place: p, item: it }) => (
              <button key={`i-${p.name}-${it.name}`} type="button" className="block min-h-11 w-full rounded-lg px-3 py-2 text-start hover:bg-muted" onClick={() => { pickPlace(p, true); pickItem(it); setSearchOpen(false); setQuery("") }}>
                <span className="block font-medium">{it.name}</span>
                <span className="block text-xs text-muted-foreground">{`${p.name} · ${it.category ?? p.category ?? ""}`}</span>
              </button>
            ))}
            {q && !exactPlace ? (
              <button
                type="button"
                className="block min-h-11 w-full rounded-lg px-3 py-2 text-start font-medium hover:bg-muted"
                onClick={() => {
                  pickPlace({ name: query.trim(), category: null, items: [] }, false)
                  setCategory(null)
                  setSearchOpen(false)
                  setQuery("")
                  setCategoryOpen(true)
                }}
              >
                {`+ Add “${query.trim()}” as a new place`}
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={(open) => { setCategoryOpen(open); if (!open) setCategoryQuery("") }}>
        <DialogContent className={cn("space-y-4", VISUAL_VIEWPORT_SHEET_CLASS)} style={categoryVv} onOpenAutoFocus={keepKeyboardDown}>
          <DialogHeader className="pe-10">
            <DialogTitle>Find a category</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Find a category"
            placeholder="Type to find, or tap below"
            value={categoryQuery}
            onChange={(e) => setCategoryQuery(e.target.value)}
          />
          <div className="flex flex-wrap content-start gap-2 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto">
            {categoryResults.map((n) => (
              <button key={n} type="button" className={chip} aria-pressed={category === n} onClick={() => { tap(); changed(); setCategory(n); setCategoryOpen(false); setCategoryQuery("") }}>
                {n}
              </button>
            ))}
            {cq && !exactCategory ? (
              <button
                type="button"
                className={chip}
                aria-pressed={false}
                onClick={async () => {
                  const name = categoryQuery.trim()
                  try {
                    await categoriesApi.create(name)
                    void queryClient.invalidateQueries({ queryKey: ["categories"] })
                    changed()
                    setCategory(name)
                    setCategoryOpen(false)
                    setCategoryQuery("")
                  } catch {
                    setError("Couldn't save. Check your connection and try again.")
                  }
                }}
              >
                {`+ New category “${categoryQuery.trim()}”`}
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

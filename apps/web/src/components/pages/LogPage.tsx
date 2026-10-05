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
import { useMemo, useRef, useState } from "react"
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
  const [pickingDate, setPickingDate] = useState(false)
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
  const ownedNames = categoryList.map((c) => c.name)
  const ownsSavingsCategory = categoryList.some((c) => c.kind === "savings")
  const categoryNames =
    ownsSavingsCategory || ownedNames.some((n) => n.toLowerCase() === GENERIC_SAVINGS_CATEGORY.toLowerCase())
      ? ownedNames
      : [...ownedNames, GENERIC_SAVINGS_CATEGORY]
  const categoryResults = cq ? categoryNames.filter((n) => n.toLowerCase().includes(cq)) : categoryNames
  const exactCategory = categoryNames.some((n) => n.toLowerCase() === cq)

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
    <div className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col gap-4 bg-background px-4 py-4">
      {/* Date */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" className="min-h-11 min-w-11 px-2" aria-label="Back" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button type="button" className={chip} aria-pressed={date === todayIso} onClick={() => { tap(); changed(); setDate(todayIso); setPickingDate(false) }}>
          Today
        </button>
        <button type="button" className={chip} aria-pressed={date === yesterdayIso} onClick={() => { tap(); changed(); setDate(yesterdayIso); setPickingDate(false) }}>
          Yesterday
        </button>
        {pickingDate ? (
          <input
            type="date"
            aria-label="Pick a date"
            className={cn(chip, "bg-card")}
            value={date}
            max={todayIso}
            onChange={(e) => { tap(); changed(); if (e.target.value) setDate(e.target.value) }}
          />
        ) : (
          <button
            type="button"
            className={chip}
            aria-pressed={date !== todayIso && date !== yesterdayIso}
            onClick={() => setPickingDate(true)}
          >
            {/* MOB-R56 D3 — the app's existing date formatter (utils.ts formatDisplayDate). */}
            {date !== todayIso && date !== yesterdayIso ? formatDisplayDate(date) : "Pick a date"}
          </button>
        )}
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
        <div className={cn("text-end font-mono text-3xl font-semibold tabular-nums", prefilled && "text-muted-foreground")} data-testid="log-amount">
          KD {amount || "0"}
        </div>
        <p className="text-sm text-muted-foreground">{hint}</p>
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
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <Button type="button" className="min-h-12" disabled={!normalized || !category || saving} onClick={() => void save()}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place or item</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Search places and items"
            placeholder="Try “americano” or “pick”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-1">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Find a category</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Find a category"
            placeholder="Type to find, or tap below"
            value={categoryQuery}
            onChange={(e) => setCategoryQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
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

// MOB-R53 Part B — manual logging on the route /log. MOB-R61 D2 made it the main expense entry (the
// FAB and "L" for an expense, the palette's "Add Expense", Activity's add on a non-income view);
// income keeps QuickAdd. Mounted inside ProtectedRoute but OUTSIDE AppShell, so neither the FAB nor
// the bottom tabs cover the keypad — without touching either.
//
// MOB-R70 E — rebuilt as option A, "Receipt" (operator's selection, MOB-R70 B6). The screen shows
// the entry as it is (C1): Amount and Category are required, Place, What for and Date are optional,
// and Date is today unless changed. Two ways in: "Repeat in two taps" (her usual places as tiles)
// and "Or fill in a new one" (one card, five lines). Each line opens its picker inline beneath it,
// one at a time; the first missing required line is tagged "Next". Save is never disabled: while
// something required is missing it says what, and a tap opens that line. Strings are
// CHANNEL-DRAFTED and provisional under RM-26 (MOB-R70 C2).
//
// MOB-R71 C7 — a tile shows its place's last_amount (MOB-R70 D), else its TOP item's amount, else no
// amount. Popular in Kuwait tiles (C2) never show one.
//
// Money is a STRING end to end (B3): the keypad builds a string (lib/log-amount), typed text goes
// through the RM-27 normalizer (lib/amount-text), and the API gets the normalised 3-decimal string.
// Display goes through the app's existing formatKD.
//
// Saves go through the existing POST /api/transactions. Undo (MOB-R53, unchanged, the operator's
// selection) calls the existing DELETE only with the id this page's own most recent create
// returned. After a save or an undo every query is invalidated (MOB-R55 G3).
// Test stats are local only: sessionStorage, shown at /log?stats=1, never sent anywhere.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Check, Delete, Plus, X } from "lucide-react"
import { ApiError, categoriesApi, transactionsApi } from "@/lib/api"
import { cn, formatDisplayDate, formatKD, kuwaitNow } from "@/lib/utils"
import { normalizeAmount, pressDecimal, pressDelete, pressDigit } from "@/lib/log-amount"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { LogSuggestionItem, LogSuggestionPlace } from "@/types/api"
import { GENERIC_SAVINGS_CATEGORY } from "@/lib/suggested-names"
import { AMOUNT_REFUSED_MESSAGE, formatAmountReadout, parseAmountText } from "@/lib/amount-text"
import { preferredColourIndex, TILE_COLOURS } from "@/lib/tile-colours"
import { searchableCategoryNames, usualCategoryNames } from "@/lib/log-categories"
import { useFinePointer } from "@/lib/use-pointer"
import { useVisualViewportVars } from "@/lib/useVisualViewport"
import { LogLayoutReadout } from "./LogLayoutReadout"
import {
  claimFirstSaveOfDay,
  firstMissing,
  localIso,
  missingFields,
  missingPhrase,
  missingSaveLabel,
  prefersReducedMotion,
  recentDateChips,
  type RequiredField,
} from "@/lib/log-entry"

export const LOG_STATS_KEY = "statera.log.stats"

/** Beginner list, shown only while the user has no places of their own (B3; MOB-R71 C2: as tiles). */
export const POPULAR_IN_KUWAIT: ReadonlyArray<{ name: string; category: string }> = [
  { name: "PICK", category: "Coffee" },
  { name: "Starbucks", category: "Coffee" },
  { name: "Sultan Center", category: "Groceries" },
  { name: "Talabat", category: "Food Delivery" },
  { name: "Oula", category: "Fuel" },
  { name: "Careem", category: "Transport" },
]
/** MOB-R74 F (E4b) — the close control's drawn circle stays 40px; an invisible ::before gives it a
 * 44x44 hit area, so the circle and its neighbours do not move. The ::before is placed against the
 * PADDING box, inside the 1px border (38px), so -3px makes 44px; -2px measured only 42px. */
export const LOG_CLOSE_HIT_AREA = "relative before:absolute before:-inset-[3px] before:content-['']"
/** E2 — how many place tiles "Repeat in two taps" shows. */
export const TILE_LIMIT = 4
/** E7 — how long the save moment stays before the form is back. */
export const SAVE_MOMENT_MS = 2600

type Line = "amount" | "category" | "place" | "what" | "date"
type StatEntry = { ms: number; taps: number; suggestion: boolean }
type Moment = { amount: string; label: string; burst: boolean; still: boolean }

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

// E2 — the colour square behind a tile's initial: one of the existing chart tokens, picked by the
// place's name so a place keeps its colour. Brass (chart-2) and ink (chart-1) are left out: brass
// is rationed, and ink is the selected-tile border. The initial is decorative (the name is beside it).
export { TILE_COLOURS }
/** MOB-R74 H (E7b) — Popular in Kuwait tiles are not her places, so they get a neutral square from the
 * existing muted tokens; colour means her places (operator selection H1, option (b)). */
export const POPULAR_TILE_SQUARE = "bg-muted text-muted-foreground"

/**
 * MOB-R74 H (E7b) — colours for her visible place tiles (at most four), never two the same. Each place
 * prefers the colour its name hashes to; places are settled in NAME order, not display order, and a
 * place whose preferred colour is taken takes the next free one. So the result depends only on which
 * places are visible: a place keeps its colour when the tiles reorder.
 */
export function assignTileColours(names: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<number>()
  for (const name of [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    let i = preferredColourIndex(name)
    for (let step = 0; step < TILE_COLOURS.length && used.has(i); step += 1) i = (i + 1) % TILE_COLOURS.length
    used.add(i)
    out.set(name, TILE_COLOURS[i])
  }
  return out
}

function usePointerDownPick() {
  return (apply: () => void) => ({
    // MOB-R82 B2 — picks on click; pointerdown and mousedown only keep the focus (WebKit sends a mousedown).
    onPointerDown: (e: { button: number; preventDefault: () => void }) => { if (e.button > 0) return; e.preventDefault() },
    onMouseDown: (e: { button: number; preventDefault: () => void }) => { if (e.button > 0) return; e.preventDefault() },
    onClick: apply,
  })
}

/** MOB-R71 C7 — the amount a tile shows (and fills): the place's last_amount (MOB-R70 D); if absent
 * or null, its top item's amount; else none. Popular tiles never pass through here and never show one. */
function tileAmount(p: LogSuggestionPlace): string | null {
  return p.last_amount ?? p.items[0]?.amount_kd ?? null
}

export default function LogPage() {
  const [params] = useSearchParams()
  if (params.get("stats") === "1") {
    return <pre className="mx-auto max-w-[28rem] whitespace-pre-wrap p-4 text-xs">{JSON.stringify(readStats(), null, 2)}</pre>
  }
  return (
    <>
      <LogPanel />
      {params.get("layout") === "1" ? <LogLayoutReadout /> : null}
    </>
  )
}

function Tag({ kind }: { kind: "required" | "next" | "optional" }) {
  if (kind === "next") {
    // "Next" in brass (E4): a brass pill with ink text. Brass AS text fails AA in light mode.
    return <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Next</span>
  }
  return (
    <span className="shrink-0 text-xs font-medium text-muted-foreground">{kind === "required" ? "Required" : "Optional"}</span>
  )
}

function EntryLine({
  id,
  label,
  value,
  hint,
  tag,
  open,
  onToggle,
  children,
}: {
  id: Line
  label: string
  value: ReactNode | null
  hint: string
  tag: "required" | "next" | "optional" | null
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-border last:border-b-0" data-line={id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`log-${id}-picker`}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span className="w-[4.75rem] shrink-0 text-sm font-medium">{label}</span>
        <span className={cn("min-w-0 flex-1 truncate", value !== null ? "font-semibold" : "text-muted-foreground")}>
          {value !== null ? value : hint}
        </span>
        {tag ? <Tag kind={tag} /> : null}
      </button>
      {open ? (
        <div id={`log-${id}-picker`} role="group" aria-label={label} className="min-w-0 space-y-3 px-4 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function LogPanel() {
  const pickProps = usePointerDownPick()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [today] = useState(() => kuwaitNow())
  const todayIso = localIso(today)
  const dateChips = recentDateChips(today)

  const { data: places = [], isSuccess: placesLoaded } = useQuery({ queryKey: ["log-suggestions"], queryFn: transactionsApi.logSuggestions })
  const { data: categoryList = [] } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list })

  // MOB-R69 E4 — computers type the amount; touch devices keep the keypad.
  const fine = useFinePointer()
  const [date, setDate] = useState(todayIso)
  const [place, setPlace] = useState<string | null>(null)
  const [placeItems, setPlaceItems] = useState<LogSuggestionItem[]>([])
  const [whatFor, setWhatFor] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [prefilled, setPrefilled] = useState(false)
  // MOB-R73 E2 — "never overwrite what she chose" (operator selection D1: everywhere). Each field
  // remembers whether SHE set it (typed or picked by her) or a suggestion did (a tile, a Popular tile,
  // place memory, an item chip). A suggestion fills a field only while it is empty or still holds a
  // suggestion. Amount carries this as `prefilled` (true = a suggestion's amount); the other three
  // carry it here. Clearing a field returns it to empty. The date is never set by a suggestion.
  const [categoryHers, setCategoryHers] = useState(false)
  const [placeHers, setPlaceHers] = useState(false)
  const [whatHers, setWhatHers] = useState(false)
  const [open, setOpen] = useState<Line | null>(null)
  const [placeQuery, setPlaceQuery] = useState("")
  const [categoryQuery, setCategoryQuery] = useState("")
  const [nudge, setNudge] = useState<string | null>(null)
  const [forceNext, setForceNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastCreatedId, setLastCreatedId] = useState<number | null>(null)
  // MOB-R78 F3 — what the last save was, for the "Last:" line (the amount as Save showed it; place, else category).
  const [lastSaved, setLastSaved] = useState<{ amount: string; label: string } | null>(null)
  const [moment, setMoment] = useState<Moment | null>(null)
  const momentTimer = useRef<number | null>(null)
  // A text picker closed by its field's blur must not be re-opened by the same tap on its line.
  const blurClosed = useRef<{ line: Line; at: number } | null>(null)

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
    setNudge(null)
  }

  useEffect(() => () => {
    if (momentTimer.current !== null) window.clearTimeout(momentTimer.current)
  }, [])

  // MOB-R69 E4 — the readout shows what will save, through the RM-27 normalizer; refused text is
  // shown as typed, with the refusal line, and cannot be saved.
  const parsed = prefilled ? null : parseAmountText(amount)
  const normalized = prefilled ? normalizeAmount(amount) : parsed?.kind === "ok" ? parsed.kd : null
  const amountRefused = parsed?.kind === "refused"
  const readout = prefilled
    ? formatAmountReadout(amount)
    : parsed?.kind === "ok"
      ? formatAmountReadout(parsed.kd)
      : parsed?.kind === "refused"
        ? `KD ${amount}`
        : "KD 0"

  const amountOk = Boolean(normalized)
  const missing = missingFields(amountOk, category !== null)
  const next = firstMissing(place !== null, amountOk, category !== null)
  const ready = missing.length === 0

  const toggle = (line: Line) => {
    const b = blurClosed.current
    if (b && b.line === line && Date.now() - b.at < 400) return
    tap()
    setOpen((o) => (o === line ? null : line))
    if (line !== "place") setPlaceQuery("")
  }

  /** E5 — after a choice, the next missing required line opens, else the picker closes. */
  const advance = (opts: { categoryChosen: boolean; amountChosen: boolean }) => {
    if (!opts.categoryChosen) setOpen("category")
    else if (!opts.amountChosen) setOpen("amount")
    else setOpen(null)
  }

  // A place she picks from search (or adds) is hers; its remembered category is a suggestion.
  const applyPlace = (p: { name: string; category: string | null; items: LogSuggestionItem[] }, fromSuggestion: boolean) => {
    tap(fromSuggestion)
    changed()
    setPlace(p.name)
    setPlaceHers(true)
    setPlaceItems(p.items)
    setPlaceQuery("")
    const takesCategory = Boolean(p.category) && !categoryHers
    if (takesCategory) setCategory(p.category)
    advance({ categoryChosen: takesCategory || category !== null, amountChosen: amountOk })
  }

  // E2 — a tile fills place, its category and its amount (C7); Save then saves. A Popular in Kuwait
  // tile (C2) has no items, so it fills place and category only and Amount becomes Next.
  // MOB-R73 E2, amended by MOB-R74 G (operator selection G1) — a tile tap IS her choice of place: it
  // sets the place to the tile's place and marks it hers. Every other field she set herself stays; a
  // field that is empty or holds a suggestion takes the tile's value. The date never changes.
  const pickTile = (p: LogSuggestionPlace) => {
    tap(true)
    changed()
    setPlace(p.name)
    setPlaceHers(true)
    setPlaceItems(p.items)
    if (p.category && !categoryHers) setCategory(p.category)
    const amountIsHers = amount !== "" && !prefilled
    const tileKd = tileAmount(p)
    if (amountIsHers) {
      // Her amount stays.
    } else if (tileKd !== null) {
      setAmount(tileKd)
      setPrefilled(true)
    } else if (prefilled) {
      // A tile without an amount fills place and category only; an amount another tile put there
      // is not hers, so it goes. An amount she typed stays.
      setAmount("")
      setPrefilled(false)
    }
    setOpen(null)
  }

  const pickCategory = (name: string) => {
    tap()
    changed()
    setCategory(name)
    setCategoryHers(true)
    setCategoryQuery("")
    setOpen(amountOk ? null : "amount")
  }

  // MOB-R78 D — the Add button and Return both add the typed category (one path).
  const addCategory = async () => {
    const name = categoryQuery.trim()
    try {
      await categoriesApi.create(name)
      void queryClient.invalidateQueries({ queryKey: ["categories"] })
      pickCategory(name)
    } catch {
      setError("Couldn't save. Check your connection and try again.")
    }
  }

  // An item chip is a suggestion (MOB-R73 E2): it fills What for and Amount only where she has not.
  const pickItem = (it: LogSuggestionItem) => {
    tap(true)
    changed()
    if (!whatHers) setWhatFor(it.name)
    if (amount === "" || prefilled) {
      setAmount(it.amount_kd)
      setPrefilled(true)
    }
    setOpen(null)
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
    setCategoryHers(false)
    setPlaceHers(false)
    setWhatHers(false)
    setPlace(null)
    setPlaceItems([])
    setWhatFor("")
    setCategory(null)
    setAmount("")
    setPrefilled(false)
    setForceNext(false)
    setOpen(null)
    setPlaceQuery("")
    setCategoryQuery("")
    setNudge(null)
    setDate(todayIso)
    stat.current = { start: null, taps: 0, suggestion: false }
  }

  const closeMoment = () => {
    if (momentTimer.current !== null) window.clearTimeout(momentTimer.current)
    momentTimer.current = null
    setMoment(null)
  }

  const save = async () => {
    if (saving) return
    if (!ready || !normalized || !category) {
      // E6 — a tap while something is missing opens the first missing line and says what.
      setNudge(`Add ${missingPhrase(missing)} to save`)
      setOpen(next as RequiredField)
      return
    }
    tap()
    setSaving(true)
    setError(null)
    try {
      const res = await transactionsApi.create({
        date,
        merchant: place ?? undefined,
        category,
        name: whatFor.trim() || place || category,
        amount_kd: normalized,
        force: forceNext ? "1" : undefined,
      })
      const id = res.data?.item?.id
      if (typeof id === "number") {
        setLastCreatedId(id)
        setLastSaved({ amount: normalized, label: place || category })
      }
      writeStats([
        ...readStats(),
        { ms: Date.now() - (stat.current.start ?? Date.now()), taps: stat.current.taps, suggestion: stat.current.suggestion },
      ])
      void queryClient.invalidateQueries()
      // E7 — the save moment. Reduced motion: a static check, no draw, no burst.
      const still = prefersReducedMotion()
      const burst = !still && claimFirstSaveOfDay(todayIso)
      setMoment({ amount: normalized, label: place || category, burst, still })
      if (momentTimer.current !== null) window.clearTimeout(momentTimer.current)
      momentTimer.current = window.setTimeout(() => {
        momentTimer.current = null
        setMoment(null)
      }, SAVE_MOMENT_MS)
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

  // E8 — Undo, today's path (MOB-R53): deletes only the id this page's last create returned, then
  // resets the form. On failure the entry is still saved, said so, and Undo stays (MOB-R56 D4).
  const undo = async () => {
    const id = lastCreatedId
    if (id === null) return
    if (momentTimer.current !== null) window.clearTimeout(momentTimer.current)
    momentTimer.current = null
    setLastCreatedId(null)
    try {
      await transactionsApi.delete(id)
      setLastSaved(null)
      void queryClient.invalidateQueries()
      resetEntry()
      setError(null)
      setMoment(null)
    } catch {
      setLastCreatedId(id)
      setError("Couldn't undo. The entry is still saved.")
    }
  }

  // MOB-R61 D3 — the way back to where the user came from; a /log opened directly (no in-app
  // history entry) goes Home instead of leaving the app.
  const goBack = () => {
    if (location.key !== "default") navigate(-1)
    else navigate("/")
  }

  // MOB-R69 E4 — digits, ".", "," and Backspace from a physical keyboard, on every device; a digit
  // opens the Amount line. Enter saves only when ready (E6). Ignored while a text field has focus
  // (that field owns its keys) and while a picker with a text field is open.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const isField = (node: EventTarget | Element | null) => {
      const n = node as HTMLElement | null
      return Boolean(n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable))
    }
    if (isField(document.activeElement) || isField(e.target)) return
    if (open === "place" || open === "what" || open === "category" || moment) return
    if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",") {
      e.preventDefault()
      typeChar(e.key)
      setOpen("amount")
    } else if (e.key === "Backspace") {
      e.preventDefault()
      key("del")
    } else if (e.key === "Enter" && ready) {
      e.preventDefault()
      void save()
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // MOB-R69 D3, kept (E10) — while a picker with a text field is open, the focused field is revealed
  // inside the VISUAL viewport after the keyboard resizes it (runs after the re-render).
  const revealFocused = () => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || el.tagName !== "INPUT") return
    const vv = window.visualViewport
    if (!vv) {
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" })
      return
    }
    const r = el.getBoundingClientRect()
    const margin = 12
    const visibleTop = vv.offsetTop + margin
    const visibleBottom = vv.offsetTop + vv.height - margin
    if (r.bottom > visibleBottom) window.scrollBy(0, r.bottom - visibleBottom)
    else if (r.top < visibleTop) window.scrollBy(0, r.top - visibleTop)
  }
  const vvStyle = useVisualViewportVars(open === "place" || open === "what" || open === "category", revealFocused)

  // E3 (a), kept — on touch devices no field takes focus when its picker opens, so no keyboard
  // appears until she taps the field. Computers take the focus.
  const autoFocusField = fine

  // Place search — her places only (E5). With no text, all of them; with text, the matches; when
  // the text matches none, the one result is "Add “{text}” as a new place".
  const pq = placeQuery.trim().toLowerCase()
  const placeResults = pq ? places.filter((p) => p.name.toLowerCase().includes(pq)) : places

  // Category — MOB-R59 D1/E9 and MOB-R69 E3 (c)/(d), unchanged: up to six of hers by her own use,
  // typing searches the rest, no income-kind category, the generic savings entry while she owns none.
  const cq = categoryQuery.trim().toLowerCase()
  const ownedNames = categoryList.map((c) => c.name)
  const ownsSavingsCategory = categoryList.some((c) => c.kind === "savings")
  const offerGenericSavings =
    !ownsSavingsCategory && !ownedNames.some((n) => n.toLowerCase() === GENERIC_SAVINGS_CATEGORY.toLowerCase())
  const withGeneric = (names: string[]) => (offerGenericSavings ? [...names, GENERIC_SAVINGS_CATEGORY] : names)
  const categoryNames = withGeneric(searchableCategoryNames(categoryList))
  const categoryResults = cq ? categoryNames.filter((n) => n.toLowerCase().includes(cq)) : withGeneric(usualCategoryNames(categoryList))
  const exactCategory = categoryNames.some((n) => n.toLowerCase() === cq) || ownedNames.some((n) => n.toLowerCase() === cq)

  // MOB-R71 C2 — with no places of her own, the existing Popular in Kuwait list, unchanged, as tiles.
  const popular = placesLoaded && places.length === 0
  const tiles: LogSuggestionPlace[] = popular
    ? POPULAR_IN_KUWAIT.map((p) => ({ ...p, count: 0, items: [], last_amount: null, last_used: null }))
    : places.slice(0, TILE_LIMIT)
  const tileColours = assignTileColours(popular ? [] : tiles.map((t) => t.name))
  const dateLabel =
    dateChips.find((c) => c.iso === date)?.label ?? formatDisplayDate(date)

  const tagFor = (field: RequiredField, filled: boolean): "required" | "next" | null =>
    filled ? null : next === field ? "next" : "required"

  if (moment) {
    return (
      <Frame onBack={goBack}>
        <SaveMoment moment={moment} canUndo={lastCreatedId !== null} error={error} onUndo={() => void undo()} onAnother={() => { closeMoment(); setError(null) }} />
      </Frame>
    )
  }

  return (
    <Frame onBack={goBack} style={vvStyle} keyboardInset={keyboardInset(vvStyle)}>
      {tiles.length > 0 ? (
        <section className="space-y-2" aria-labelledby="log-repeat">
          <h2 id="log-repeat" className="text-sm font-semibold text-muted-foreground">{popular ? "Popular in Kuwait" : "Repeat in two taps"}</h2>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((p) => {
              const tileKd = popular ? null : tileAmount(p)
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={place === p.name}
                  onClick={() => pickTile(p)}
                  className="flex min-h-16 min-w-0 items-center gap-3 rounded-[var(--radius-card)] border-2 border-border bg-card p-3 text-start transition-colors aria-pressed:border-primary"
                >
                  <span
                    aria-hidden="true"
                    data-testid="log-tile-square"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold",
                      popular ? POPULAR_TILE_SQUARE : cn("text-white", tileColours.get(p.name))
                    )}
                  >
                    {p.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    {tileKd !== null ? <span className="block font-mono text-xs tabular-nums text-muted-foreground">{formatKD(tileKd)}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* MOB-R78 F4 — 16px between the form card and the Save bar: the frame's gap-4 (MOB-R82 B5). */}
      <section className="space-y-2" aria-labelledby={tiles.length > 0 ? "log-new" : undefined}>
        {tiles.length > 0 ? (
          <h2 id="log-new" className="text-sm font-semibold text-muted-foreground">Or fill in a new one</h2>
        ) : null}
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
          <EntryLine
            id="amount"
            label="Amount"
            value={amount !== "" ? <span className="font-mono tabular-nums">{readout}</span> : null}
            hint="How much"
            tag={tagFor("amount", amountOk)}
            open={open === "amount"}
            onToggle={() => toggle("amount")}
          >
            {fine ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                aria-label="Amount (KD)"
                placeholder="0.000"
                value={amount}
                onFocus={(e) => {
                  const el = e.currentTarget
                  if (prefilled) el.select()
                  else el.setSelectionRange(el.value.length, el.value.length)
                }}
                onChange={(e) => { tap(); changed(); setPrefilled(false); setAmount(e.target.value) }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ready) {
                    e.preventDefault()
                    void save()
                  }
                }}
                className={cn(
                  "w-full min-w-0 rounded-[var(--radius-input)] border border-input bg-background px-3 py-2 text-end font-mono text-2xl font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  prefilled && "text-muted-foreground"
                )}
              />
            ) : (
              <div className={cn("text-end font-mono text-3xl font-semibold tabular-nums", prefilled && "text-muted-foreground")} data-testid="log-amount">
                {readout}
              </div>
            )}
            {fine ? <div className="sr-only" data-testid="log-amount">{readout}</div> : null}
            {amountRefused ? <p className="text-end text-sm text-destructive">{AMOUNT_REFUSED_MESSAGE}</p> : null}
            {fine ? null : (
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="min-h-12 rounded-[var(--radius-input)] border border-border bg-background text-xl font-semibold"
                    aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : undefined}
                    onClick={() => key(k)}
                  >
                    {k === "del" ? <Delete className="mx-auto h-5 w-5" /> : k}
                  </button>
                ))}
              </div>
            )}
            {amountOk && category === null ? (
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { tap(); setOpen("category") }}>
                Next: category
              </Button>
            ) : null}
          </EntryLine>

          <EntryLine
            id="category"
            label="Category"
            value={category}
            hint="Type of spending"
            tag={tagFor("category", category !== null)}
            open={open === "category"}
            onToggle={() => toggle("category")}
          >
            {place !== null && category === null ? (
              <p className="text-sm font-medium">{`What kind of spending is ${place}?`}</p>
            ) : null}
            <Input
              aria-label="Find a category"
              placeholder="Type to find, or tap below"
              autoFocus={autoFocusField}
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
              enterKeyHint="done"
              onKeyDown={(e) => {
                // MOB-R78 D4 — Return picks the first entry listed, else adds the typed text. Never saves.
                if (e.key !== "Enter") return
                e.preventDefault()
                if (!cq) return
                if (categoryResults.length > 0) pickCategory(categoryResults[0])
                else if (!exactCategory) void addCategory()
              }}
              onBlur={() => {
                // MOB-R80 B2 — closing the keyboard with nothing typed closes the search (as MOB-R70 E5 for Place);
                // with text typed it stays open with the text and its Add button (MOB-R78 D5). Nothing is added.
                if (cq) return
                blurClosed.current = { line: "category", at: Date.now() }
                setOpen((o) => (o === "category" ? null : o))
              }}
            />
            {/* MOB-R78 D3 — the Add button at the top: brass tint, ink text, at least 44px; the label as ruled in MOB-R82 C10 and MOB-R83 C4. */}
            {cq && !exactCategory ? (
              <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-accent bg-accent/15 px-3 py-2 text-start font-semibold text-foreground" onClick={() => void addCategory()}>
                <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{`Add “${categoryQuery.trim()}” as a new category`}</span>
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {/* MOB-R81 B4 / MOB-R82 B2 — a chip picks on click through pickProps; pointerdown and mousedown keep
                  the search input's focus, and a press that turns into a scroll picks nothing. */}
              {categoryResults.map((n, i) => (
                <button key={n} type="button" className={cn(chip, cq && i === 0 && "ring-2 ring-primary/60")} data-highlighted={cq && i === 0 ? "true" : undefined} aria-pressed={category === n} {...pickProps(() => pickCategory(n))}>
                  {n}
                </button>
              ))}
            </div>
          </EntryLine>

          <EntryLine
            id="place"
            label="Place"
            value={place}
            hint="Shop or app"
            tag={place === null ? "optional" : null}
            open={open === "place"}
            onToggle={() => toggle("place")}
          >
            <Input
              aria-label="Search places"
              placeholder="Shop or app"
              autoFocus={autoFocusField}
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              enterKeyHint="done"
              onKeyDown={(e) => {
                // MOB-R78 D4 — Return picks the first place listed, else adds the typed text. Never saves.
                if (e.key !== "Enter") return
                e.preventDefault()
                if (!pq) return
                if (placeResults.length > 0) applyPlace(placeResults[0], true)
                else applyPlace({ name: placeQuery.trim(), category: null, items: [] }, false)
              }}
              onBlur={() => {
                // MOB-R70 E5 (from the operator's MOB-R70 B1) and MOB-R80 B2 (his MOB-R80 B1 choice): closing the
                // keyboard with nothing typed closes the search; with text typed it stays open with the text and its
                // Add button. A pick on pointer down has already moved on. Nothing is added on blur.
                if (pq) return
                blurClosed.current = { line: "place", at: Date.now() }
                setPlaceQuery("")
                setOpen((o) => (o === "place" ? null : o))
              }}
            />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {/* MOB-R80 B3 — Add shows whenever the typed text has no exact match (exactCategory's comparison); matches
                  stay listed under it. MOB-R78 D3 look; today's label (MOB-R79 C1). */}
              {pq && !places.some((p) => p.name.toLowerCase() === pq) ? (
                <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-accent bg-accent/15 px-3 py-2 text-start font-semibold text-foreground" {...pickProps(() => applyPlace({ name: placeQuery.trim(), category: null, items: [] }, false))}>
                  <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{`Add “${placeQuery.trim()}” as a new place`}</span>
                </button>
              ) : null}
              {placeResults.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={cn("block min-h-11 w-full rounded-lg px-3 py-2 text-start hover:bg-muted", pq && i === 0 && "ring-2 ring-primary/60")}
                  data-highlighted={pq && i === 0 ? "true" : undefined}
                  {...pickProps(() => applyPlace(p, true))}
                >
                  <span className="block truncate font-medium">{p.name}</span>
                  {p.category ? <span className="block truncate text-xs text-muted-foreground">{p.category}</span> : null}
                </button>
              ))}
            </div>
          </EntryLine>

          <EntryLine
            id="what"
            label="What for"
            value={whatFor.trim() ? whatFor.trim() : null}
            hint="Item or note"
            tag={whatFor.trim() ? null : "optional"}
            open={open === "what"}
            onToggle={() => toggle("what")}
          >
            {placeItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {placeItems.map((it) => (
                  <button key={it.name} type="button" className={chip} aria-pressed={whatFor.trim() === it.name} {...pickProps(() => pickItem(it))}>
                    {`${it.name} · ${formatKD(it.amount_kd)}`}
                  </button>
                ))}
              </div>
            ) : null}
            <Input
              aria-label="What for"
              placeholder="Item or note"
              autoFocus={autoFocusField}
              value={whatFor}
              onChange={(e) => { changed(); setWhatFor(e.target.value); setWhatHers(e.target.value.trim() !== "") }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  e.currentTarget.blur()
                  setOpen(null)
                }
              }}
              onBlur={() => {
                // E5 — Enter or closing the keyboard keeps the text and closes.
                blurClosed.current = { line: "what", at: Date.now() }
                setOpen((o) => (o === "what" ? null : o))
              }}
            />
          </EntryLine>

          <EntryLine
            id="date"
            label="Date"
            value={dateLabel}
            hint="Today"
            tag={null}
            open={open === "date"}
            onToggle={() => toggle("date")}
          >
            <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {dateChips.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  className={chip}
                  aria-pressed={date === c.iso}
                  onClick={() => { tap(); changed(); setDate(c.iso); setOpen(null) }}
                >
                  {c.label}
                </button>
              ))}
            </div>
              {/* MOB-R69 E2, kept for older days — the real date field lies over the chip,
                  transparent, so the tap lands on it (iPhone opens its picker on that tap); on
                  computers showPicker() opens the calendar from anywhere on the chip.
                  MOB-R73 E3 — set apart on its own row: a calendar icon, brass-tint fill, brass
                  border, so it stands out from the day chips. */}
              <span className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-accent bg-accent/15 px-4 text-sm font-semibold text-foreground">
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                <span aria-hidden="true">Earlier date</span>
                <input
                  type="date"
                  aria-label="Earlier date"
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
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v || v > todayIso) return
                    tap()
                    changed()
                    setDate(v)
                    setOpen(null)
                  }}
                />
              </span>
            </div>
          </EntryLine>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 bg-background px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        {/* MOB-R71 C1, MOB-R78 F3 — after a save, one line above Save says what Undo would remove:
            "Last: KD 2.500 · Talabat" and a text button "Undo" (44px). It updates on the next save, goes after
            an Undo, and goes when she leaves /log. Undo deletes only the row this page created last (MOB-R53). */}
        {lastCreatedId !== null && lastSaved ? (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-muted-foreground">{`Last: ${formatKD(lastSaved.amount)} · ${lastSaved.label}`}</p>
            {/* MOB-R79 D2 — visible "Undo"; the accessible name "Undo last" contains it. */}
            <Button type="button" variant="ghost" size="sm" aria-label="Undo last" className="min-h-11 min-w-11 shrink-0 font-semibold" onClick={() => void undo()}>
              Undo
            </Button>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p aria-live="polite" className="min-h-0 text-sm font-medium text-foreground empty:hidden">{nudge ?? ""}</p>
        <Button
          type="button"
          variant={ready ? "default" : "outline"}
          aria-busy={saving || undefined}
          className={cn("min-h-12 w-full rounded-full text-base", ready && "justify-center gap-3")}
          onClick={() => void save()}
        >
          {ready && normalized ? (
            <>
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              {`Save ${formatKD(normalized)}`}
            </>
          ) : (
            missingSaveLabel(missing)
          )}
        </Button>
      </div>
    </Frame>
  )
}

function Frame({
  onBack,
  children,
  style,
  keyboardInset = 0,
}: {
  onBack: () => void
  children: ReactNode
  style?: CSSProperties
  keyboardInset?: number
}) {
  return (
    // MOB-R69 E1 — at least 16px from both edges, plus the safe-area insets (notch, home bar).
    <div style={style} className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col gap-4 bg-background ps-[calc(1rem+env(safe-area-inset-left))] pe-[calc(1rem+env(safe-area-inset-right))] pt-[calc(1rem+var(--safe-top))]">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">New expense</h1>
          <p className="text-sm text-muted-foreground">Amount and category are all you need.</p>
        </div>
        {/* E1 — the close control. Its accessible name stays "Back": it returns to where she came
            from (MOB-R61 D3), which is what it does, and what the existing test names it. */}
        {/* MOB-R73 E4 — a 40px circle (surface fill, border, ink icon), like Home's header buttons. The
            button primitive's 44px touch minimum is overridden to the ruled 40px; MOB-R74 F restores a
            44px hit area with LOG_CLOSE_HIT_AREA. The ring shows only on keyboard focus (E8). */}
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-10 min-h-10 min-w-10 shrink-0 rounded-full border-border bg-card p-0 text-foreground pointer-coarse:min-h-10 pointer-coarse:min-w-10",
            LOG_CLOSE_HIT_AREA
          )}
          aria-label="Back"
          onClick={onBack}
        >
          <X className="h-5 w-5" />
        </Button>
      </header>
      {children}
      {/* MOB-R70 F4 / MOB-R71 C6 — only while the keyboard shrinks the visual viewport: room below the
          page as tall as the keyboard, so a field near the end (What for) can still be scrolled above
          it. With the keyboard down there is no spacer at all. */}
      {keyboardInset > 0 ? <div aria-hidden="true" data-testid="log-keyboard-spacer" className="shrink-0" style={{ height: keyboardInset }} /> : null}
    </div>
  )
}

/**
 * MOB-R71 C6 — how far the keyboard shrinks the visual viewport below the layout viewport, from the
 * --vv-height the hook reports. The layout viewport is documentElement.clientHeight, which the iOS
 * keyboard does not shrink. 0 when the hook is inactive or nothing is hidden.
 */
function keyboardInset(vvStyle: CSSProperties | undefined): number {
  if (!vvStyle || typeof document === "undefined") return 0
  const vvHeight = parseFloat(String((vvStyle as Record<string, unknown>)["--vv-height"] ?? ""))
  if (!Number.isFinite(vvHeight)) return 0
  return Math.max(0, Math.round(document.documentElement.clientHeight - vvHeight))
}

function SaveMoment({
  moment,
  canUndo,
  error,
  onUndo,
  onAnother,
}: {
  moment: Moment
  canUndo: boolean
  error: string | null
  onUndo: () => void
  onAnother: () => void
}) {
  const amountText = formatKD(moment.amount)
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center" data-testid="log-save-moment">
      {/* Screen readers hear exactly this (E7). */}
      <p role="status" className="sr-only">{`Logged, ${amountText}`}</p>
      <div aria-hidden="true" className="relative">
        {moment.burst ? (
          <div data-testid="log-burst" className="pointer-events-none absolute inset-0">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="log-burst-square absolute start-1/2 top-1/2 h-2 w-2 bg-accent" style={{ ["--i" as string]: i }} />
            ))}
          </div>
        ) : null}
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} data-testid="log-check" className={moment.still ? undefined : "log-check-draw"} />
          </svg>
        </span>
      </div>
      <div aria-hidden="true" className="space-y-1">
        <p className="text-xl font-semibold">Logged</p>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">{`${amountText} · ${moment.label}`}</p>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex w-full max-w-xs gap-2">
        {canUndo ? (
          <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onUndo}>
            Undo
          </Button>
        ) : null}
        <Button type="button" className="min-h-11 flex-1" onClick={onAnother}>
          Log another
        </Button>
      </div>
    </section>
  )
}

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Tag,
  Store,
  BookmarkPlus,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Lock,
  X,
} from "lucide-react"

import {
  categoriesApi,
  merchantsApi,
  memorizedApi,
  ApiError,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { nameColour } from "@/lib/tile-colours"
import { useToast } from "@/components/ui/toaster"
import type {
  Category,
  CategoryDependentCounts,
  Merchant,
  MerchantDependentCounts,
  MemorizedTransaction,
} from "@/types/api"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebounce } from "./helpers"

// ============================================================
// MOB-R91 D — the list and the item screen, shared by Categories and Places
// ============================================================
// A list: one box "Find or add a …" that filters as she types and, when nothing matches her text exactly, offers
// an Add "<text>" row. Each row: the initial tile, the name, and (categories that hold expenses) "N expenses". A tap
// opens the item's own screen: its name, what it is used in, Merge into another …, and Delete … as the red row.
// Delete and merge keep today's confirm and flow. Back returns to the list with the search kept.

const ROW =
  "flex min-h-14 w-full items-center gap-3 border-b border-border/40 px-4 py-2 text-start last:border-b-0"

function InitialTile({ name, className }: { name: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="manage-tile"
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold", className)}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

function FindOrAdd({
  noun,
  value,
  onChange,
}: {
  noun: "category" | "place"
  value: string
  onChange: (v: string) => void
}) {
  const label = `Find or add a ${noun}`
  return (
    <div className="relative">
      {/* D5 — 16px text, so iOS does not zoom into the box. */}
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pe-11 text-base"
        autoCapitalize="words"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Clear"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

/** The rows matching her text, and whether an Add row belongs under them (nothing matches the text exactly). */
function filterByText<T extends { name: string }>(items: T[], text: string): { shown: T[]; canAdd: boolean } {
  const q = text.trim().toLowerCase()
  if (!q) return { shown: items, canAdd: false }
  const shown = items.filter((i) => i.name.toLowerCase().includes(q))
  return { shown, canAdd: !items.some((i) => i.name.trim().toLowerCase() === q) }
}

function AddRow({ text, onAdd, adding }: { text: string; onAdd: () => void; adding: boolean }) {
  return (
    <button type="button" className={cn(ROW, "font-semibold text-primary")} onClick={onAdd} disabled={adding}>
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
        <Plus className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate">{`Add "${text.trim()}"`}</span>
    </button>
  )
}

function ItemRow({
  name,
  tileClass,
  meta,
  locked,
  onOpen,
}: {
  name: string
  tileClass: string
  meta: string | null
  locked?: boolean
  onOpen: () => void
}) {
  return (
    <button type="button" className={cn(ROW, "hover:bg-muted/50")} onClick={onOpen}>
      <InitialTile name={name} className={tileClass} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="System category — cannot be deleted" /> : null}
          <span className="block truncate text-base font-medium sm:text-sm">{name}</span>
        </span>
        {meta ? <span className="block text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ListBox({ children }: { children: ReactNode }) {
  // D5 — no box scrolling inside a box: the list grows and the dialog's one scroll area scrolls it.
  return <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">{children}</div>
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onBack} className="-ms-2 min-h-11 gap-1 px-2 text-sm font-semibold">
      <ChevronLeft className="h-4 w-4" />
      Back
    </Button>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border/40 px-4 py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-base font-medium sm:text-sm">{children}</span>
    </div>
  )
}

function ActionRow({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(ROW, "font-semibold disabled:opacity-50", danger ? "text-destructive" : "text-foreground")}
    >
      {children}
    </button>
  )
}

/** "N expenses" for a category that holds expenses. None for a category counted as income: its rows are income. */
function expensesLabel(c: Category): string | null {
  if (c.counts_as_income || c.is_income || typeof c.transaction_count !== "number") return null
  return `${c.transaction_count} expense${c.transaction_count === 1 ? "" : "s"}`
}

// Categories have no colour of their own; a neutral square, as /log gives tiles that are not her places.
const CATEGORY_TILE = "bg-muted text-muted-foreground"

// ============================================================
// ManageCategories
// ============================================================

type CategoryDeleteState =
  | { phase: "idle" }
  | { phase: "confirm"; id: number; name: string }
  | { phase: "reassign"; id: number; name: string; counts: CategoryDependentCounts }
  | { phase: "conflict"; conflicting_periods: string[] }

function ManageCategories({
  onRefresh,
  onScreenChange,
}: {
  onRefresh: () => void
  onScreenChange: (detail: boolean) => void
}) {
  const toast = useToast()
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [delState, setDelState] = useState<CategoryDeleteState>({ phase: "idle" })
  const [deleting, setDeleting] = useState(false)
  const [reassignTargetId, setReassignTargetId] = useState("")

  // Merge dialog
  const [remapSourceId, setRemapSourceId] = useState<number | null>(null)
  const [remapTargetId, setRemapTargetId] = useState("")
  const [remapping, setRemapping] = useState(false)

  const opened = useMemo(() => allCategories.find((c) => c.id === openId) ?? null, [allCategories, openId])
  useEffect(() => { onScreenChange(opened !== null) }, [opened, onScreenChange])

  const remapSource = useMemo(
    () => allCategories.find((c) => c.id === remapSourceId) ?? null,
    [allCategories, remapSourceId]
  )
  const remapTargets = useMemo(() => {
    if (!remapSource) return []
    return allCategories.filter((c) => !c.is_system && c.id !== remapSource.id)
  }, [allCategories, remapSource])

  const nonSystemTargets = useMemo(
    () => allCategories.filter((c) => !c.is_system),
    [allCategories]
  )

  const loadAll = useCallback(async () => {
    setLoadingList(true)
    try {
      const items = await categoriesApi.list()
      setAllCategories(items)
    } catch {
      // silently fail
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!remapSource) {
      setRemapTargetId("")
      return
    }
    const firstId = remapTargets[0]?.id
    setRemapTargetId(firstId ? String(firstId) : "")
  }, [remapSource, remapTargets])

  const handleAdd = async () => {
    const name = search.trim()
    if (!name) return
    setAdding(true)
    try {
      await categoriesApi.create(name)
      setSearch("")
      onRefresh()
      void loadAll()
      toast.success(`Category "${name}" created.`)
    } catch {
      toast.error("We couldn't create that category right now.")
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteRequest = (cat: Category) => {
    setDelState({ phase: "confirm", id: cat.id, name: cat.name })
  }

  const handleDeleteConfirm = async () => {
    if (delState.phase !== "confirm" && delState.phase !== "reassign") return
    const id = delState.id
    setDeleting(true)
    try {
      const reassignTo =
        delState.phase === "reassign" && reassignTargetId
          ? Number(reassignTargetId)
          : undefined
      await categoriesApi.delete(id, reassignTo)
      setDelState({ phase: "idle" })
      setReassignTargetId("")
      setOpenId(null)
      onRefresh()
      void loadAll()
      toast.success("Category deleted.")
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const code = err.code
        const meta = err.meta ?? {}
        if (code === "has_dependents") {
          const counts = meta.dependent_counts as CategoryDependentCounts
          const name = delState.phase === "confirm" ? delState.name : (delState as { name: string }).name
          const firstNonSource = nonSystemTargets.find((c) => c.id !== id)
          setReassignTargetId(firstNonSource ? String(firstNonSource.id) : "")
          setDelState({ phase: "reassign", id, name, counts })
        } else if (code === "budget_conflict") {
          const periods = meta.conflicting_periods as string[]
          setDelState({ phase: "conflict", conflicting_periods: periods ?? [] })
        } else {
          toast.error(err.message || "Could not delete category.")
          setDelState({ phase: "idle" })
        }
      } else {
        toast.error("We couldn't delete that category right now.")
        setDelState({ phase: "idle" })
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleRemap = async () => {
    if (!remapSourceId || !remapTargetId) return
    setRemapping(true)
    try {
      const result = await categoriesApi.remap(remapSourceId, Number(remapTargetId))
      setRemapSourceId(null)
      onRefresh()
      void loadAll()
      const txnLabel = `${result.remapped_count} transaction${result.remapped_count === 1 ? "" : "s"}`
      toast.success(`Moved ${txnLabel} to target category.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "budget_conflict") {
        const periods = (err.meta?.conflicting_periods as string[]) ?? []
        toast.error(
          `Budget conflict for period${periods.length === 1 ? "" : "s"}: ${periods.join(", ")}. Resolve before merging.`
        )
      } else {
        toast.error("We couldn't merge that category right now.")
      }
    } finally {
      setRemapping(false)
    }
  }

  const { shown, canAdd } = filterByText(allCategories, search)
  const usedIn = opened ? expensesLabel(opened) : null

  return (
    <>
      {opened ? (
        // D2 — the category's own screen. D3: today's API has no rename for a category, so its name is shown, not
        // edited.
        <div className="space-y-4" data-testid="manage-detail">
          <BackRow onBack={() => setOpenId(null)} />
          <div className="flex items-center gap-3">
            <InitialTile name={opened.name} className={CATEGORY_TILE} />
            <h3 className="min-w-0 truncate text-lg font-semibold">{opened.name}</h3>
          </div>
          <ListBox>
            <DetailRow label="Name">{opened.name}</DetailRow>
            {usedIn ? <DetailRow label="Used in">{usedIn}</DetailRow> : null}
          </ListBox>
          {opened.is_system ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-label="System category — cannot be deleted" />
              A built-in category: it can't be merged or deleted.
            </p>
          ) : (
            <ListBox>
              <ActionRow onClick={() => setRemapSourceId(opened.id)} disabled={nonSystemTargets.length <= 1}>
                <ArrowRightLeft className="h-4 w-4 shrink-0" />
                Merge into another category
              </ActionRow>
              <ActionRow onClick={() => handleDeleteRequest(opened)} danger>
                <Trash2 className="h-4 w-4 shrink-0" />
                Delete category
              </ActionRow>
            </ListBox>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <FindOrAdd noun="category" value={search} onChange={setSearch} />
          {loadingList && allCategories.length === 0 ? null : shown.length > 0 || canAdd ? (
            <ListBox>
              {shown.map((c) => (
                <ItemRow
                  key={c.id}
                  name={c.name}
                  tileClass={CATEGORY_TILE}
                  meta={expensesLabel(c)}
                  locked={c.is_system}
                  onOpen={() => setOpenId(c.id)}
                />
              ))}
              {canAdd ? <AddRow text={search} onAdd={() => void handleAdd()} adding={adding} /> : null}
            </ListBox>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No categories yet. Add one above to organize your transactions and budgets.
            </p>
          )}
        </div>
      )}

      {/* Step 1: simple confirm */}
      <ConfirmDialog
        title="Delete this category?"
        open={delState.phase === "confirm"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
        message={
          delState.phase === "confirm"
            ? `Delete category "${delState.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleting}
      />

      {/* Step 2: reassign picker */}
      <Dialog
        open={delState.phase === "reassign"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Move transactions before deleting</DialogTitle>
            <DialogDescription>
              {delState.phase === "reassign" ? (
                <>
                  <span className="font-medium">"{delState.name}"</span> has{" "}
                  {delState.counts.transactions} transaction{delState.counts.transactions === 1 ? "" : "s"}
                  {delState.counts.budgets > 0 && `, ${delState.counts.budgets} budget${delState.counts.budgets === 1 ? "" : "s"}`}
                  . Choose a category to move them to, then delete.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="cat-reassign-target">Move to</Label>
            <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
              <SelectTrigger id="cat-reassign-target" className="h-10 text-sm">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {nonSystemTargets
                  .filter((c) => delState.phase === "reassign" && c.id !== delState.id)
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDelState({ phase: "idle" })}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              loading={deleting}
              disabled={deleting || !reassignTargetId}
              className="w-full sm:w-auto"
            >
              Move &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Budget conflict notice */}
      <Dialog
        open={delState.phase === "conflict"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Budget conflict</DialogTitle>
            <DialogDescription>
              Both categories have budgets for the same period
              {delState.phase === "conflict" && delState.conflicting_periods.length !== 1 ? "s" : ""}:{" "}
              {delState.phase === "conflict" ? delState.conflicting_periods.join(", ") : ""}. Resolve the
              budget conflict before deleting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelState({ phase: "idle" })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={!!remapSource} onOpenChange={(open) => !open && setRemapSourceId(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Merge category</DialogTitle>
            <DialogDescription>
              {remapSource
                ? `Move all ${remapSource.transaction_count ?? 0} transactions from "${remapSource.name}" to another category.`
                : "Move all transactions from this category to another category."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="category-remap-target">Move to</Label>
            <Select value={remapTargetId} onValueChange={setRemapTargetId}>
              <SelectTrigger id="category-remap-target" className="h-10 text-sm">
                <SelectValue placeholder="Select target category" />
              </SelectTrigger>
              <SelectContent>
                {remapTargets.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRemapSourceId(null)}
              disabled={remapping}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => void handleRemap()}
              loading={remapping}
              disabled={remapping || !remapTargetId}
              className="w-full sm:w-auto"
            >
              Move Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// ManagePlaces — places are merchants in the API and the data (D4: only the words change)
// ============================================================

type MerchantDeleteState =
  | { phase: "idle" }
  | { phase: "confirm"; id: number; name: string }
  | { phase: "reassign"; id: number; name: string; counts: MerchantDependentCounts }

function ManageMerchants({
  onRefresh,
  onScreenChange,
}: {
  onRefresh: () => void
  onScreenChange: (detail: boolean) => void
}) {
  const toast = useToast()
  const [allMerchants, setAllMerchants] = useState<Merchant[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [delState, setDelState] = useState<MerchantDeleteState>({ phase: "idle" })
  const [deleting, setDeleting] = useState(false)
  const [reassignTargetId, setReassignTargetId] = useState("")

  // Merge dialog
  const [remapSourceId, setRemapSourceId] = useState<number | null>(null)
  const [remapTargetId, setRemapTargetId] = useState("")
  const [remapping, setRemapping] = useState(false)

  // Rename in place, on the place's own screen
  const [editName, setEditName] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const opened = useMemo(() => allMerchants.find((m) => m.id === openId) ?? null, [allMerchants, openId])
  useEffect(() => { onScreenChange(opened !== null) }, [opened, onScreenChange])

  const remapSource = useMemo(
    () => allMerchants.find((m) => m.id === remapSourceId) ?? null,
    [allMerchants, remapSourceId]
  )
  const remapTargets = useMemo(() => {
    if (!remapSource) return []
    return allMerchants.filter((m) => m.id !== remapSource.id)
  }, [allMerchants, remapSource])

  const loadAll = useCallback(async () => {
    setLoadingList(true)
    try {
      const items = await merchantsApi.list()
      setAllMerchants(items)
    } catch {
      // silently fail
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!remapSource) {
      setRemapTargetId("")
      return
    }
    const firstId = remapTargets[0]?.id
    setRemapTargetId(firstId ? String(firstId) : "")
  }, [remapSource, remapTargets])

  const handleAdd = async () => {
    const name = search.trim()
    if (!name) return
    setAdding(true)
    try {
      await merchantsApi.create(name)
      setSearch("")
      onRefresh()
      void loadAll()
      toast.success(`Place "${name}" created.`)
    } catch {
      toast.error("We couldn't create that place right now.")
    } finally {
      setAdding(false)
    }
  }

  const openPlace = (m: Merchant) => {
    setOpenId(m.id)
    setEditName(m.name)
  }

  const handleEditSave = async () => {
    if (!opened || !editName.trim() || editName.trim() === opened.name) return
    const id = opened.id
    setEditSaving(true)
    try {
      await merchantsApi.update(id, editName.trim())
      setAllMerchants((prev) =>
        prev.map((m) => (m.id === id ? { ...m, name: editName.trim() } : m))
      )
      onRefresh()
      toast.success("Place renamed.")
    } catch {
      toast.error("We couldn't rename that place right now.")
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteRequest = (m: Merchant) => {
    setDelState({ phase: "confirm", id: m.id, name: m.name })
  }

  const handleDeleteConfirm = async () => {
    if (delState.phase !== "confirm" && delState.phase !== "reassign") return
    const id = delState.id
    setDeleting(true)
    try {
      const reassignTo =
        delState.phase === "reassign" && reassignTargetId
          ? Number(reassignTargetId)
          : undefined
      await merchantsApi.delete(id, reassignTo)
      setDelState({ phase: "idle" })
      setReassignTargetId("")
      setOpenId(null)
      onRefresh()
      void loadAll()
      toast.success("Place deleted.")
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "has_dependents") {
        const counts = err.meta?.dependent_counts as MerchantDependentCounts
        const name = delState.phase === "confirm" ? delState.name : (delState as { name: string }).name
        const firstNonSource = allMerchants.find((m) => m.id !== id)
        setReassignTargetId(firstNonSource ? String(firstNonSource.id) : "")
        setDelState({ phase: "reassign", id, name, counts })
      } else {
        toast.error("We couldn't delete that place right now.")
        setDelState({ phase: "idle" })
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleRemap = async () => {
    if (!remapSourceId || !remapTargetId) return
    setRemapping(true)
    try {
      const result = await merchantsApi.remap(remapSourceId, Number(remapTargetId))
      setRemapSourceId(null)
      setOpenId(null)
      onRefresh()
      void loadAll()
      const txnLabel = `${result.remapped_count} transaction${result.remapped_count === 1 ? "" : "s"}`
      toast.success(`Moved ${txnLabel} to target place.`)
    } catch {
      toast.error("We couldn't merge that place right now.")
    } finally {
      setRemapping(false)
    }
  }

  const { shown, canAdd } = filterByText(allMerchants, search)
  const nameChanged = opened !== null && editName.trim() !== "" && editName.trim() !== opened.name

  return (
    <>
      {opened ? (
        // D2 — the place's own screen. Rename in place. No "Used in": the places API returns no count (no API change
        // in this block).
        <div className="space-y-4" data-testid="manage-detail">
          <BackRow onBack={() => setOpenId(null)} />
          <div className="flex items-center gap-3">
            <InitialTile name={opened.name} className={cn("text-white", nameColour(opened.name))} />
            <h3 className="min-w-0 truncate text-lg font-semibold">{opened.name}</h3>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="place-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="place-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleEditSave()}
                className="h-11 text-base"
              />
              {nameChanged ? (
                <Button type="button" className="h-11 shrink-0" onClick={() => void handleEditSave()} loading={editSaving} disabled={editSaving}>
                  Save
                </Button>
              ) : null}
            </div>
          </div>
          <ListBox>
            <ActionRow onClick={() => setRemapSourceId(opened.id)} disabled={allMerchants.length <= 1}>
              <ArrowRightLeft className="h-4 w-4 shrink-0" />
              Merge into another place
            </ActionRow>
            <ActionRow onClick={() => handleDeleteRequest(opened)} danger>
              <Trash2 className="h-4 w-4 shrink-0" />
              Delete place
            </ActionRow>
          </ListBox>
        </div>
      ) : (
        <div className="space-y-3">
          <FindOrAdd noun="place" value={search} onChange={setSearch} />
          {loadingList && allMerchants.length === 0 ? null : shown.length > 0 || canAdd ? (
            <ListBox>
              {shown.map((m) => (
                // D2 — the place's colour as on the Log screen and in Activity (lib/tile-colours.ts).
                <ItemRow key={m.id} name={m.name} tileClass={cn("text-white", nameColour(m.name))} meta={null} onOpen={() => openPlace(m)} />
              ))}
              {canAdd ? <AddRow text={search} onAdd={() => void handleAdd()} adding={adding} /> : null}
            </ListBox>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No places yet. Add one above to keep your transaction history tidy.
            </p>
          )}
        </div>
      )}

      {/* Step 1: simple confirm */}
      <ConfirmDialog
        title="Delete this place?"
        open={delState.phase === "confirm"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
        message={
          delState.phase === "confirm"
            ? `Delete place "${delState.name}"? Transactions will lose their place tag.`
            : ""
        }
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleting}
      />

      {/* Step 2: reassign picker */}
      <Dialog
        open={delState.phase === "reassign"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Move transactions before deleting</DialogTitle>
            <DialogDescription>
              {delState.phase === "reassign" ? (
                <>
                  <span className="font-medium">"{delState.name}"</span> has{" "}
                  {delState.counts.transactions} transaction{delState.counts.transactions === 1 ? "" : "s"}. Choose
                  a place to move them to, then delete.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="merch-reassign-target">Move to</Label>
            <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
              <SelectTrigger id="merch-reassign-target" className="h-10 text-sm">
                <SelectValue placeholder="Select place" />
              </SelectTrigger>
              <SelectContent>
                {allMerchants
                  .filter((m) => delState.phase === "reassign" && m.id !== delState.id)
                  .map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDelState({ phase: "idle" })}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              loading={deleting}
              disabled={deleting || !reassignTargetId}
              className="w-full sm:w-auto"
            >
              Move &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={!!remapSource} onOpenChange={(open) => !open && setRemapSourceId(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
          <DialogHeader>
            <DialogTitle>Merge place</DialogTitle>
            <DialogDescription>
              {remapSource
                ? `Move all transactions from "${remapSource.name}" to another place.`
                : "Move all transactions from this place to another place."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="merchant-remap-target">Move to</Label>
            <Select value={remapTargetId} onValueChange={setRemapTargetId}>
              <SelectTrigger id="merchant-remap-target" className="h-10 text-sm">
                <SelectValue placeholder="Select target place" />
              </SelectTrigger>
              <SelectContent>
                {remapTargets.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRemapSourceId(null)}
              disabled={remapping}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => void handleRemap()}
              loading={remapping}
              disabled={remapping || !remapTargetId}
              className="w-full sm:w-auto"
            >
              Move Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// ManageMemorized
// ============================================================

const SORT_OPTIONS = [
  { value: "most_used", label: "Most used" },
  { value: "recently_used", label: "Recently used" },
  { value: "oldest_first", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
] as const

type SortKey = typeof SORT_OPTIONS[number]["value"]

const PAGE_SIZE = 100

function ManageMemorized() {
  const toast = useToast()
  const [searchQ, setSearchQ] = useState("")
  const [sort, setSort] = useState<SortKey>("most_used")
  const debouncedQ = useDebounce(searchQ, 200)
  const [items, setItems] = useState<MemorizedTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmDelId, setConfirmDelId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async (opts: { q: string; sort: SortKey; append?: boolean; offset?: number }) => {
    setLoading(true)
    try {
      const data = await memorizedApi.list({
        q: opts.q || undefined,
        sort: opts.sort,
        limit: PAGE_SIZE,
        offset: opts.offset ?? 0,
      })
      if (opts.append) {
        setItems((prev) => [...prev, ...(data.items || [])])
      } else {
        setItems(data.items || [])
      }
      setTotal(data.total)
      setHasMore(data.has_more)
      setLoaded(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load memorized transactions.")
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Initial load
  useEffect(() => {
    if (!loaded) void load({ q: "", sort: "most_used" })
  }, [loaded, load])

  // Reload on search/sort change
  useEffect(() => {
    if (!loaded) return
    void load({ q: debouncedQ, sort })
  }, [debouncedQ, sort, load])

  const handlePin = async (item: MemorizedTransaction) => {
    const next = !item.is_pinned
    try {
      const data = await memorizedApi.pin(item.id, next)
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)))
    } catch {
      toast.error("Couldn't update pin state.")
    }
  }

  const handleDelete = async () => {
    if (!confirmDelId) return
    setDeleting(true)
    try {
      await memorizedApi.delete(confirmDelId)
      setItems((prev) => prev.filter((i) => i.id !== confirmDelId))
      setTotal((prev) => Math.max(0, prev - 1))
      setConfirmDelId(null)
      toast.success("Memorized transaction deleted.")
    } catch {
      toast.error("Couldn't delete that memorized transaction.")
    } finally {
      setDeleting(false)
    }
  }

  const loadMore = () => {
    void load({ q: debouncedQ, sort, append: true, offset: items.length })
  }

  return (
    <div className="space-y-3">
      {/* Header: search + sort */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            placeholder="Search by name, place, or category…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="h-10 pr-8 text-base sm:text-sm"
          />
          {searchQ && (
            <button
              type="button"
              onClick={() => setSearchQ("")}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground pointer-coarse:-me-3.5 pointer-coarse:min-w-11 pointer-coarse:justify-center"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Desktop sort */}
        <div className="hidden sm:block">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-10 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mobile filters toggle */}
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:hidden"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters
        </Button>
      </div>

      {/* Mobile filter sheet */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-3 sm:hidden">
          <Label className="mb-1 block text-xs text-muted-foreground">Sort</Label>
          <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); setShowFilters(false) }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Count bar */}
      {loaded && (
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "No memorized transactions"
            : `${total} memorized transaction${total === 1 ? "" : "s"}`}
          {searchQ ? ` matching "${searchQ}"` : ""}
        </p>
      )}

      {/* MOB-R91 D5 — rows in the dialog's one scroll area; no list box scrolling inside it. At most 100 rows load at
          a time (PAGE_SIZE), with Load More, so a plain list stands in for the virtualized one. */}
      {items.length > 0 ? (
        <ListBox>
          {items.map((item) => (
            <div key={item.id} className="flex min-h-14 items-center justify-between gap-2 border-b border-border/40 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  {item.is_pinned && (
                    <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="Pinned" />
                  )}
                  <span className="truncate text-base font-medium sm:text-sm">{item.canonical}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {item.merchant?.name && (
                    <span className="truncate">{item.merchant.name}</span>
                  )}
                  {item.merchant?.name && item.category?.name && (
                    <span className="shrink-0">·</span>
                  )}
                  {item.category?.name && (
                    <span className="truncate">{item.category.name}</span>
                  )}
                  <span className="shrink-0 text-[10px]">×{item.count || 1}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0"
                  title={item.is_pinned ? "Unpin" : "Pin to top"}
                  aria-label={item.is_pinned ? "Unpin" : "Pin to top"}
                  onClick={() => void handlePin(item)}
                >
                  {item.is_pinned ? (
                    <PinOff className="h-4 w-4" />
                  ) : (
                    <Pin className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => setConfirmDelId(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </ListBox>
      ) : loaded && !loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {searchQ
            ? "No memorized transactions match your search."
            : "No memorized transactions yet. Statera remembers what you log and suggests it next time."}
        </p>
      ) : null}

      {loading && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {hasMore && !loading && (
        <div className="pt-1 text-center">
          <Button variant="outline" size="sm" onClick={loadMore}>
            Load More
          </Button>
        </div>
      )}

      <ConfirmDialog
        title="Delete this memorized transaction?"
        open={!!confirmDelId}
        onOpenChange={(v) => !v && setConfirmDelId(null)}
        message={`Delete memorized transaction "${items.find((i) => i.id === confirmDelId)?.canonical}"? It will no longer appear in autocomplete suggestions.`}
        onConfirm={() => void handleDelete()}
        loading={deleting}
      />
    </div>
  )
}

// ============================================================
// SettingsDialog — Tabbed dialog for Categories/Merchants/Memorized
// ============================================================

function SettingsDialog({
  open,
  onOpenChange,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<"categories" | "merchants" | "memorized">("categories")
  // D2 — while a category or place has its own screen open, the tab row steps aside; Back brings it back.
  const [detail, setDetail] = useState(false)
  const selectTab = (key: typeof tab) => {
    setDetail(false)
    setTab(key)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* D5 — on phones the whole screen (dvh), the top clear of the status bar; desktop keeps the dialog. One scroll
          area (the tab content); the dialog itself does not scroll. */}
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1rem)] max-w-4xl flex-col space-y-5 overflow-y-hidden sm:w-full max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:pt-[calc(1.25rem+var(--safe-top))]">
        <DialogHeader>
          <DialogTitle>Categories &amp; places</DialogTitle>
          <DialogDescription>
            Manage categories, places, and memorized transactions.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar — one row on every width */}
        {detail ? null : (
          <div className="segmented-surface grid grid-cols-3 gap-1">
            {(
              [
                { key: "categories", label: "Categories", icon: Tag },
                { key: "merchants", label: "Places", icon: Store },
                { key: "memorized", label: "Memorized", icon: BookmarkPlus },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                aria-pressed={tab === key}
                onClick={() => selectTab(key)}
                className={cn(
                  "min-h-11 justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-all sm:gap-2 sm:px-4 sm:text-base",
                  tab === key
                    ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground"
                )}
              >
                <Icon className="hidden h-4 w-4 sm:block" />
                {label}
              </Button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-2">
          {tab === "categories" && (
            <ManageCategories onRefresh={onRefresh} onScreenChange={setDetail} />
          )}
          {tab === "merchants" && (
            <ManageMerchants onRefresh={onRefresh} onScreenChange={setDetail} />
          )}
          {tab === "memorized" && (
            <ManageMemorized />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog

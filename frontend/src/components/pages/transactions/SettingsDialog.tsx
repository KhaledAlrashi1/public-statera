import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Tag,
  Store,
  BookmarkPlus,
  ArrowRightLeft,
  Pin,
  PinOff,
  Trash2,
  Lock,
  Pencil,
  Check,
  X,
} from "lucide-react"

import {
  categoriesApi,
  merchantsApi,
  memorizedApi,
  ApiError,
} from "@/lib/api"
import { cn } from "@/lib/utils"
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
// ManageCategories
// ============================================================

type CategoryDeleteState =
  | { phase: "idle" }
  | { phase: "confirm"; id: number; name: string }
  | { phase: "reassign"; id: number; name: string; counts: CategoryDependentCounts }
  | { phase: "conflict"; conflicting_periods: string[] }

function ManageCategories({
  onRefresh,
}: {
  onRefresh: () => void
}) {
  const toast = useToast()
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [delState, setDelState] = useState<CategoryDeleteState>({ phase: "idle" })
  const [deleting, setDeleting] = useState(false)
  const [reassignTargetId, setReassignTargetId] = useState("")

  // Merge dialog
  const [remapSourceId, setRemapSourceId] = useState<number | null>(null)
  const [remapTargetId, setRemapTargetId] = useState("")
  const [remapping, setRemapping] = useState(false)

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
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await categoriesApi.create(name)
      setNewName("")
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

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
            className="h-10 text-sm"
          />
          <Button
            variant="default"
            onClick={() => void handleAdd()}
            disabled={adding || !newName.trim()}
            className="h-10 w-full sm:min-w-[110px] sm:w-auto"
          >
            Add
          </Button>
        </div>

        {loadingList ? null : allCategories.length > 0 ? (
          <div className="surface-scroll-card max-h-64 overflow-y-auto">
            {allCategories.map((c) => (
              <div
                key={c.id}
                className="flex flex-col items-start gap-3 border-b border-border/30 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  {c.is_system ? (
                    <Lock
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-label="System category — cannot be deleted"
                    />
                  ) : null}
                  <span className="text-sm">{c.name}</span>
                  {typeof c.transaction_count === "number" ? (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {c.transaction_count} txn{c.transaction_count === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {!c.is_system && (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full gap-1.5 px-3 text-xs sm:w-auto"
                      disabled={nonSystemTargets.length <= 1}
                      onClick={() => setRemapSourceId(c.id)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Merge into…
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 w-full px-3 text-xs sm:w-auto"
                      onClick={() => handleDeleteRequest(c)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No categories yet. Add one above to organize your transactions and budgets.
          </p>
        )}
      </div>

      {/* Step 1: simple confirm */}
      <ConfirmDialog
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
                  {delState.counts.goals > 0 && `, ${delState.counts.goals} goal${delState.counts.goals === 1 ? "" : "s"}`}
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
            <DialogTitle>Merge Category</DialogTitle>
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
// ManageMerchants
// ============================================================

type MerchantDeleteState =
  | { phase: "idle" }
  | { phase: "confirm"; id: number; name: string }
  | { phase: "reassign"; id: number; name: string; counts: MerchantDependentCounts }

function ManageMerchants({
  onRefresh,
}: {
  onRefresh: () => void
}) {
  const toast = useToast()
  const [allMerchants, setAllMerchants] = useState<Merchant[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [delState, setDelState] = useState<MerchantDeleteState>({ phase: "idle" })
  const [deleting, setDeleting] = useState(false)
  const [reassignTargetId, setReassignTargetId] = useState("")

  // Merge dialog
  const [remapSourceId, setRemapSourceId] = useState<number | null>(null)
  const [remapTargetId, setRemapTargetId] = useState("")
  const [remapping, setRemapping] = useState(false)

  // Rename inline
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editSaving, setEditSaving] = useState(false)

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
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await merchantsApi.create(name)
      setNewName("")
      onRefresh()
      void loadAll()
      toast.success(`Merchant "${name}" created.`)
    } catch {
      toast.error("We couldn't create that merchant right now.")
    } finally {
      setAdding(false)
    }
  }

  const startEditName = (m: Merchant) => {
    setEditId(m.id)
    setEditName(m.name)
  }

  const handleEditSave = async () => {
    if (!editId || !editName.trim()) return
    setEditSaving(true)
    try {
      await merchantsApi.update(editId, editName.trim())
      setAllMerchants((prev) =>
        prev.map((m) => (m.id === editId ? { ...m, name: editName.trim() } : m))
      )
      setEditId(null)
      onRefresh()
      toast.success("Merchant renamed.")
    } catch {
      toast.error("We couldn't rename that merchant right now.")
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
      onRefresh()
      void loadAll()
      toast.success("Merchant deleted.")
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "has_dependents") {
        const counts = err.meta?.dependent_counts as MerchantDependentCounts
        const name = delState.phase === "confirm" ? delState.name : (delState as { name: string }).name
        const firstNonSource = allMerchants.find((m) => m.id !== id)
        setReassignTargetId(firstNonSource ? String(firstNonSource.id) : "")
        setDelState({ phase: "reassign", id, name, counts })
      } else {
        toast.error("We couldn't delete that merchant right now.")
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
      onRefresh()
      void loadAll()
      const txnLabel = `${result.remapped_count} transaction${result.remapped_count === 1 ? "" : "s"}`
      toast.success(`Moved ${txnLabel} to target merchant.`)
    } catch {
      toast.error("We couldn't merge that merchant right now.")
    } finally {
      setRemapping(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="New merchant name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
            className="h-10 text-sm"
          />
          <Button
            variant="default"
            onClick={() => void handleAdd()}
            disabled={adding || !newName.trim()}
            className="h-10 w-full sm:min-w-[110px] sm:w-auto"
          >
            Add
          </Button>
        </div>

        {loadingList ? null : allMerchants.length > 0 ? (
          <div className="surface-scroll-card max-h-64 overflow-y-auto">
            {allMerchants.map((m) => (
              <div
                key={m.id}
                className="flex flex-col items-start gap-3 border-b border-border/30 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                {editId === m.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleEditSave()
                        if (e.key === "Escape") setEditId(null)
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => void handleEditSave()}
                      disabled={editSaving}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setEditId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm">{m.name}</span>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full gap-1.5 px-3 text-xs sm:w-auto"
                        onClick={() => startEditName(m)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full gap-1.5 px-3 text-xs sm:w-auto"
                        disabled={allMerchants.length <= 1}
                        onClick={() => setRemapSourceId(m.id)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Merge into…
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 w-full px-3 text-xs sm:w-auto"
                        onClick={() => handleDeleteRequest(m)}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No merchants yet. Add one above to keep your transaction history tidy.
          </p>
        )}
      </div>

      {/* Step 1: simple confirm */}
      <ConfirmDialog
        open={delState.phase === "confirm"}
        onOpenChange={(v) => !v && setDelState({ phase: "idle" })}
        message={
          delState.phase === "confirm"
            ? `Delete merchant "${delState.name}"? Transactions will lose their merchant tag.`
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
                  a merchant to move them to, then delete.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="merch-reassign-target">Move to</Label>
            <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
              <SelectTrigger id="merch-reassign-target" className="h-10 text-sm">
                <SelectValue placeholder="Select merchant" />
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
            <DialogTitle>Merge Merchant</DialogTitle>
            <DialogDescription>
              {remapSource
                ? `Move all transactions from "${remapSource.name}" to another merchant.`
                : "Move all transactions from this merchant to another merchant."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="merchant-remap-target">Move to</Label>
            <Select value={remapTargetId} onValueChange={setRemapTargetId}>
              <SelectTrigger id="merchant-remap-target" className="h-10 text-sm">
                <SelectValue placeholder="Select target merchant" />
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

  const parentRef = useRef<HTMLDivElement>(null)

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

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  })

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

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="space-y-3">
      {/* Header: search + sort */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            placeholder="Search by name, merchant, or category…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="h-10 pr-8 text-sm"
          />
          {searchQ && (
            <button
              type="button"
              onClick={() => setSearchQ("")}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
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

      {/* Virtualized list */}
      {items.length > 0 ? (
        <div
          ref={parentRef}
          className="surface-scroll-card overflow-y-auto"
          style={{ height: Math.min(items.length * 56, 400) }}
        >
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((vRow) => {
              const item = items[vRow.index]
              return (
                <div
                  key={item.id}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="flex items-center justify-between border-b border-border/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      {item.is_pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="Pinned" />
                      )}
                      <span className="truncate text-sm font-medium">{item.canonical}</span>
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
                  <div className="ml-2 flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={item.is_pinned ? "Unpin" : "Pin to top"}
                      onClick={() => void handlePin(item)}
                    >
                      {item.is_pinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                      onClick={() => setConfirmDelId(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : loaded && !loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {searchQ
            ? "No memorized transactions match your search."
            : "No memorized transactions yet. Repeated transactions will appear here as you use the app."}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1rem)] max-w-4xl flex-col space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Categories &amp; Merchants</DialogTitle>
          <DialogDescription>
            Manage categories, merchants, and memorized transactions.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="segmented-surface grid gap-2 sm:grid-cols-3">
          {(
            [
              { key: "categories", label: "Categories", icon: Tag },
              { key: "merchants", label: "Merchants", icon: Store },
              { key: "memorized", label: "Memorized", icon: BookmarkPlus },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              onClick={() => setTab(key)}
              className={cn(
                "justify-start gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all sm:justify-center sm:px-4 sm:text-base",
                tab === key
                  ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                  : "text-muted-foreground hover:bg-transparent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto pt-2">
          {tab === "categories" && (
            <ManageCategories onRefresh={onRefresh} />
          )}
          {tab === "merchants" && (
            <ManageMerchants onRefresh={onRefresh} />
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

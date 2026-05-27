import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { transactionsApi } from "@/lib/api"
import { useToast } from "@/components/ui/toaster"
import type { Transaction } from "@/types/api"

type RowEdit = {
  id: number
  date: string
  name: string
  merchant: string
  category: string
}

const NO_CHANGE = "__no_change__"

export function BulkEditDialog({
  open,
  onOpenChange,
  selectedIds,
  categories,
  merchants,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  selectedIds: number[]
  categories: string[]
  merchants: string[]
  onSuccess: () => void
}) {
  const toast = useToast()
  const [rows, setRows] = useState<RowEdit[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Apply-to-all fields
  const [applyMerchant, setApplyMerchant] = useState("")
  const [applyCategory, setApplyCategory] = useState(NO_CHANGE)
  const [applyName, setApplyName] = useState("")

  // Fetch details for selected transactions
  const {
    data: txnDetails,
    isLoading,
    isFetching,
    error: txnDetailsError,
    refetch: refetchTxnDetails,
  } = useQuery({
    queryKey: ["transactions", "bulk-edit", selectedIds],
    queryFn: async () => {
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          const response = await transactionsApi.get(id)
          if (!response.ok || !response.data) {
            throw new Error(`Transaction ${id} could not be loaded for bulk edit.`)
          }
          return response.data.item
        })
      )
      return results as Transaction[]
    },
    enabled: open && selectedIds.length > 0,
    staleTime: 0,
  })
  const txnDetailsErrorMessage = txnDetailsError instanceof Error
    ? txnDetailsError.message
    : txnDetailsError
      ? "We couldn't load those transactions for bulk edit."
      : null

  useEffect(() => {
    if (!open) {
      setApplyMerchant("")
      setApplyCategory(NO_CHANGE)
      setApplyName("")
      setError(null)
      return
    }
    if (txnDetails) {
      setRows(
        txnDetails.map((t) => ({
          id: t.transaction_id ?? t.id,
          date: t.date || "",
          name: t.name || "",
          merchant: t.merchant || "",
          category: t.category || "",
        }))
      )
    }
  }, [open, txnDetails])

  const handleApplyToAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        merchant: applyMerchant.trim() !== "" ? applyMerchant.trim() : r.merchant,
        category: applyCategory !== NO_CHANGE ? applyCategory : r.category,
        name: applyName.trim() !== "" ? applyName.trim() : r.name,
      }))
    )
  }

  const updateRow = (id: number, field: keyof RowEdit, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const handleSave = async () => {
    if (rows.length === 0) return
    setError(null)
    setSaving(true)
    try {
      // Find original rows to detect changes
      const originals = txnDetails ?? []
      const updates: Array<Promise<unknown>> = []
      for (const row of rows) {
        const orig = originals.find((t) => (t.transaction_id ?? t.id) === row.id)
        if (!orig) continue
        const changes: Record<string, string> = {}
        if (row.name.trim() && row.name.trim() !== orig.name) changes.name = row.name.trim()
        if (row.merchant !== (orig.merchant || "")) changes.merchant = row.merchant.trim()
        if (row.category && row.category !== orig.category) changes.category = row.category
        if (Object.keys(changes).length > 0) {
          // Provide required fields for individual update
          updates.push(
            transactionsApi.update(row.id, {
              date: orig.date,
              name: changes.name ?? orig.name,
              category: changes.category ?? orig.category,
              merchant: changes.merchant ?? orig.merchant ?? "",
              amount_kd: String(orig.amount_kd),
            })
          )
        }
      }
      if (updates.length > 0) {
        await Promise.all(updates)
        toast.success(`Updated ${updates.length} transaction${updates.length === 1 ? "" : "s"}.`)
      } else {
        toast.success("No changes to save.")
      }
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save those changes right now.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl flex-col sm:w-full">
        <DialogHeader>
          <DialogTitle>Edit {selectedIds.length} transaction{selectedIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Use "Apply to all rows" to set a value across all selections, or edit individual rows below.
          </DialogDescription>
        </DialogHeader>

        {/* Apply-to-all section */}
        <div className="surface-muted-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Apply to all rows
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Merchant</Label>
              <Input
                placeholder="Leave blank to keep existing"
                value={applyMerchant}
                onChange={(e) => setApplyMerchant(e.target.value)}
                list="bulk-merchants"
                className="h-8 text-sm"
              />
              <datalist id="bulk-merchants">
                {merchants.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={applyCategory} onValueChange={setApplyCategory}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Keep existing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANGE}>Keep existing</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Transaction name</Label>
              <Input
                placeholder="Leave blank to keep existing"
                value={applyName}
                onChange={(e) => setApplyName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleApplyToAll}
            disabled={!applyMerchant.trim() && applyCategory === NO_CHANGE && !applyName.trim()}
          >
            Apply to all rows
          </Button>
        </div>

        {/* Per-row table */}
        <div className="surface-scroll-card min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {selectedIds.map((id) => (
                  <div key={id} className="skeleton h-48 rounded-[var(--radius-inner)]" />
                ))}
              </div>
              <div className="hidden space-y-2 p-4 md:block">
                {selectedIds.map((id) => (
                  <div key={id} className="skeleton h-10 rounded-lg" />
                ))}
              </div>
            </>
          ) : txnDetailsErrorMessage ? (
            <div className="flex h-full min-h-[220px] items-center justify-center p-6">
              <div className="w-full max-w-lg rounded-xl border border-warning/35 bg-warning/10 px-4 py-4 text-sm">
                <p className="font-semibold text-warning">Bulk edit unavailable</p>
                <p className="mt-1 text-muted-foreground">{txnDetailsErrorMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void refetchTxnDetails()
                  }}
                  loading={isFetching}
                  disabled={isFetching}
                >
                  {isFetching ? "Retrying..." : "Retry"}
                </Button>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              No transactions selected for bulk edit.
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {rows.map((row) => (
                  <article key={row.id} className="inner-card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Transaction
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">{row.date}</p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        #{row.id}
                      </span>
                    </div>

                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Transaction name</Label>
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, "name", e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Merchant</Label>
                        <Input
                          value={row.merchant}
                          onChange={(e) => updateRow(row.id, "merchant", e.target.value)}
                          list="bulk-merchants"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={row.category}
                          onValueChange={(v) => updateRow(row.id, "category", v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="surface-scroll-card hidden overflow-auto md:block">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="th-standard w-28">Date</th>
                      <th className="th-standard">Transaction</th>
                      <th className="th-standard w-44">Merchant</th>
                      <th className="th-standard w-44">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border/40">
                        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{row.date}</td>
                        <td className="px-3 py-2">
                          <Input
                            value={row.name}
                            onChange={(e) => updateRow(row.id, "name", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={row.merchant}
                            onChange={(e) => updateRow(row.id, "merchant", e.target.value)}
                            list="bulk-merchants"
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={row.category}
                            onValueChange={(v) => updateRow(row.id, "category", v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => { void handleSave() }}
            loading={saving}
            disabled={saving || isLoading || Boolean(txnDetailsErrorMessage) || rows.length === 0}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : "Save All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

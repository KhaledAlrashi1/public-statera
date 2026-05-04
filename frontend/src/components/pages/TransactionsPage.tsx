import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  Plus,
  Upload,
  Settings2,
  Pencil,
  Trash2,
  X as XIcon,
} from "lucide-react"
import {
  authApi,
  categoriesApi,
  merchantsApi,
  transactionsApi,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { useQuickAdd } from "@/contexts/QuickAddContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import PageHeader from "@/components/layout/PageHeader"
import { useToast } from "@/components/ui/toaster"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DemoWorkspaceBanner } from "@/components/ui/demo-workspace-banner"
import {
  type PreviewRow,
} from "./transactions/helpers"
import {
  EditTransactionDialog,
} from "./transactions/dialogs"
import TransactionsTable from "./transactions/TransactionsTable"
import SettingsDialog from "./transactions/SettingsDialog"
import {
  ImportDialog,
  PreviewImportDialog,
  type FlaggedRowDiagnostic,
  type SkippedRowDiagnostic,
} from "./transactions/ImportDialogs"
import { BulkEditDialog } from "./transactions/BulkEditDialog"




// ============================================================
// Main TransactionsPage
// ============================================================

type ActivityType = "all" | "expense" | "income"

function normalizeActivityType(value: string | null): ActivityType {
  if (value === "expense" || value === "income") return value
  return "all"
}

export default function TransactionsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { openQuickAdd } = useQuickAdd()
  const [searchParams, setSearchParams] = useSearchParams()

  // Reference data
  const {
    data: categoriesRaw = [],
    error: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  })

  const {
    data: merchantsRaw = [],
    error: merchantsError,
    isFetching: merchantsFetching,
    refetch: refetchMerchants,
  } = useQuery({
    queryKey: ["merchants"],
    queryFn: merchantsApi.list,
  })

  const {
    data: profileResp,
    error: profileError,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["auth-profile", "activity"],
    queryFn: () => authApi.profile(),
    staleTime: 5 * 60 * 1000,
  })

  const categoryNames = useMemo(
    () => categoriesRaw.map((c) => c.name),
    [categoriesRaw]
  )
  const merchantNames = useMemo(
    () => merchantsRaw.map((m) => m.name),
    [merchantsRaw]
  )
  const activityType = useMemo(
    () => normalizeActivityType(searchParams.get("type")),
    [searchParams]
  )

  const setActivityType = useCallback((nextType: ActivityType) => {
    const next = new URLSearchParams(searchParams)
    if (nextType === "all") next.delete("type")
    else next.set("type", nextType)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Local state
  const [editTxnId, setEditTxnId] = useState<number | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewCapped, setPreviewCapped] = useState(false)
  const [previewTotalCount, setPreviewTotalCount] = useState(0)
  const [previewRowsTruncated, setPreviewRowsTruncated] = useState(0)
  const [previewFlaggedCount, setPreviewFlaggedCount] = useState(0)
  const [previewFileHash, setPreviewFileHash] = useState<string | undefined>(undefined)
  const [previewFlaggedRows, setPreviewFlaggedRows] = useState<FlaggedRowDiagnostic[]>([])
  const [previewSkippedRows, setPreviewSkippedRows] = useState<SkippedRowDiagnostic[]>([])
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [clearingDemoData, setClearingDemoData] = useState(false)

  useEffect(() => {
    if (searchParams.get("import") !== "1") return
    setImportOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete("import")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Animation lock
  const [animDone, setAnimDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAnimDone(true), 800)
    return () => clearTimeout(timer)
  }, [])

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] })
    queryClient.invalidateQueries({ queryKey: ["categories"] })
    queryClient.invalidateQueries({ queryKey: ["merchants"] })
    queryClient.invalidateQueries({ queryKey: ["auth-profile"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
    queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
    queryClient.invalidateQueries({ queryKey: ["budgets"] })
    queryClient.invalidateQueries({ queryKey: ["debt-accounts-summary"] })
    queryClient.invalidateQueries({ queryKey: ["analytics-account-overview"] })
    queryClient.invalidateQueries({ queryKey: ["snapshot"] })
    queryClient.invalidateQueries({ queryKey: ["savings-goals"] })
    setRefreshSignal((v) => v + 1)
  }, [queryClient])

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((ids: number[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }, [])

  const confirmBulkDelete = useCallback(async () => {
    const ids = [...selectedIds]
    const count = ids.length
    setBulkDeleting(true)
    try {
      await transactionsApi.bulkDelete(ids)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      refreshAll()
      toast.success(`${count} transaction${count === 1 ? "" : "s"} deleted.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't delete those transactions right now."
      toast.error(msg)
    } finally {
      setBulkDeleting(false)
    }
  }, [selectedIds, refreshAll, toast])

  const demoWorkspace = profileResp?.demo_workspace
  const activeDemoWorkspace = demoWorkspace?.active ? demoWorkspace : null
  const demoWorkspaceActive = Boolean(activeDemoWorkspace)
  const referenceDataError = categoriesError || merchantsError || profileError
  const referenceDataErrorMessage = referenceDataError instanceof Error
    ? referenceDataError.message
    : referenceDataError
      ? "We couldn't load your transaction tools right now."
      : null

  const clearDemoWorkspace = useCallback(async () => {
    setClearingDemoData(true)
    try {
      const summary = await authApi.clearDemoData()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["merchants"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
        queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
        queryClient.invalidateQueries({ queryKey: ["budgets"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-accounts-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics-account-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["savings-goals"] }),
      ])
      setPreviewOpen(false)
      setImportOpen(false)
      toast.success(
        `Cleared ${summary.transactions_cleared} demo transactions and ${summary.budgets_cleared} demo budgets.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't clear the demo workspace right now."
      toast.error(message)
    } finally {
      setClearingDemoData(false)
    }
  }, [queryClient, toast])

  const activityTitle =
    activityType === "expense"
      ? "Track, import, and manage expenses"
      : activityType === "income"
        ? "Track, import, and manage income"
        : "Track, import, and manage records"
  const addLabel =
    activityType === "expense"
      ? "Add Expense"
      : activityType === "income"
        ? "Add Income"
        : "Add Transaction"

  return (
    <div
      className={cn(
        "theme-transactions space-y-8",
        animDone && "animations-complete"
      )}
    >
      {/* Page Header */}
      <PageHeader
        badge="Transactions"
        badgeDotClassName="bg-primary"
        title={activityTitle}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              title="Import from CSV/Excel or bank messages"
              className="h-10 rounded-full px-4 text-sm font-semibold shadow-sm"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button
              variant="default"
              size="pill"
              onClick={() => openQuickAdd(activityType === "income" ? "income" : "expense")}
              className="rounded-full px-5"
            >
              <Plus className="mr-2 h-4 w-4" />
              {addLabel}
            </Button>
          </>
        )}
      />

      {referenceDataErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Transaction tools unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Categories, merchants, or demo workspace status may be incomplete. {referenceDataErrorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void Promise.all([
                  refetchCategories(),
                  refetchMerchants(),
                  refetchProfile(),
                ])
              }}
              loading={categoriesFetching || merchantsFetching || profileFetching}
              disabled={categoriesFetching || merchantsFetching || profileFetching}
            >
              {categoriesFetching || merchantsFetching || profileFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          tabs={[
            { id: "all", label: "All" },
            { id: "expense", label: "Expenses" },
            { id: "income", label: "Income" },
          ]}
          value={activityType}
          onChange={setActivityType}
          activeClassName="bg-card text-primary shadow-sm ring-1 ring-primary/15"
          ariaLabel="Activity type tabs"
        />
        <Button
          variant="ghost"
          onClick={() => setSettingsOpen(true)}
          title="Manage categories, merchants, and memorized transaction titles"
          className="h-9 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          Categories & Merchants
        </Button>
      </div>

      {demoWorkspaceActive ? (
        <DemoWorkspaceBanner
          demoWorkspace={activeDemoWorkspace!}
          onOpenImport={() => setImportOpen(true)}
          onClearDemoWorkspace={() => {
            void clearDemoWorkspace()
          }}
          clearing={clearingDemoData}
        />
      ) : null}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-[var(--header-h,64px)] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-2.5 shadow-md sm:gap-3">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {selectedIds.size} selected
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => setBulkEditOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-destructive/35 px-3 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Clear selection"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Full-width table */}
      <TransactionsTable
        categories={categoryNames}
        merchants={merchantNames}
        onEdit={(id) => {
          setEditTxnId(id)
          setEditOpen(true)
        }}
        onImport={() => setImportOpen(true)}
        refreshSignal={refreshSignal}
        transactionType={activityType}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
      />

      {/* Dialogs */}
      <EditTransactionDialog
        txnId={editTxnId}
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categoryNames}
        onSuccess={refreshAll}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedIds={[...selectedIds]}
        categories={categoryNames}
        merchants={merchantNames}
        onSuccess={() => {
          setSelectedIds(new Set())
          refreshAll()
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete transactions?"
        message={`Delete ${selectedIds.size} selected transaction${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Delete all"
        loading={bulkDeleting}
        onConfirm={() => { void confirmBulkDelete() }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onRefresh={refreshAll}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onPreviewReady={(rows, meta) => {
          setPreviewRows(rows)
          setPreviewCapped(meta?.capped ?? false)
          setPreviewTotalCount(meta?.totalCount ?? 0)
          setPreviewRowsTruncated(meta?.rowsTruncated ?? 0)
          setPreviewFlaggedCount(meta?.flaggedCount ?? 0)
          setPreviewFileHash(meta?.fileHash)
          setPreviewFlaggedRows(meta?.flaggedRows ?? [])
          setPreviewSkippedRows(meta?.skippedRows ?? [])
          setPreviewOpen(true)
        }}
      />

      <PreviewImportDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        initialRows={previewRows}
        onImportComplete={refreshAll}
        categories={categoryNames}
        merchants={merchantNames}
        capped={previewCapped}
        totalCount={previewTotalCount}
        rowsTruncated={previewRowsTruncated}
        flaggedCount={previewFlaggedCount}
        fileHash={previewFileHash}
        flaggedRows={previewFlaggedRows}
        skippedRows={previewSkippedRows}
        demoWorkspace={activeDemoWorkspace ?? undefined}
      />
    </div>
  )
}

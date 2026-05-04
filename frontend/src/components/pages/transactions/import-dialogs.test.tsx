import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ApiError } from "@/lib/api"

import { ImportDialog, PreviewImportDialog } from "./ImportDialogs"

const mocks = vi.hoisted(() => ({
  uploadApi: {
    preview: vi.fn(),
    importCommit: vi.fn(),
    deleteImportBatch: vi.fn(),
  },
  transactionsApi: {
    suggestions: vi.fn(),
  },
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    uploadApi: mocks.uploadApi,
    transactionsApi: mocks.transactionsApi,
  }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mocks.toast.success,
    error: mocks.toast.error,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

describe("PreviewImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadApi.preview.mockResolvedValue({
      ok: true,
      count: 1,
      capped: false,
      preview_rows: [],
    })
    mocks.uploadApi.importCommit.mockResolvedValue({
      ok: true,
      imported: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      skipped_duplicate: 0,
      skipped_idempotent: 0,
    })
    mocks.uploadApi.deleteImportBatch.mockResolvedValue({
      ok: true,
      deleted_count: 1,
    })
  })

  it("defaults to replacing demo data when demo workspace is active", async () => {
    const onImportComplete = vi.fn()

    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={onImportComplete}
        categories={["Food"]}
        merchants={["Cafe"]}
        demoWorkspace={{
          active: true,
          clearable: true,
          loaded_at: "2026-03-06T12:00:00+00:00",
          month: "2026-03",
          months_seeded: 6,
          transactions: 49,
          budgets: 7,
          debt_accounts: 1,
          savings_goals: 1,
          profile_seeded_fields: ["monthly_income_kd", "payday_day", "country"],
        }}
      />
    )

    expect(screen.getByText("Replace demo workspace before import")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Replace Demo & Import 1" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Replace Demo & Import 1" }))

    await waitFor(() => {
      expect(mocks.uploadApi.importCommit).toHaveBeenCalledWith(
        expect.any(Array),
        [],
        { replaceDemoData: true, atomic: true, fileHash: undefined }
      )
    })
    expect(onImportComplete).toHaveBeenCalledTimes(1)
  })

  it("shows category as an explicit preview field", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
      />
    )

    expect(screen.getAllByText("Category").length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue("Food").length).toBeGreaterThan(0)
  })

  it("blocks import and shows specific row issues for incomplete preview rows", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2099-01-01",
            merchant: "Cafe",
            name: "Coffee",
            category: "",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
      />
    )

    expect(screen.getByText("1 issue")).toBeInTheDocument()
    expect(screen.getByText("2 field issues")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Issue details" }))
    expect(screen.getByText("Date cannot be in the future.")).toBeInTheDocument()
    expect(screen.getByText("Category is required.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve & Import 1" })).toBeDisabled()
  })

  it("flags duplicate rows and lets the user exclude them before import", async () => {
    const onImportComplete = vi.fn()

    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            likely_dup: true,
            duplicate_reason: "import_row_duplicate_existing",
            duplicate_message: "Duplicate row already exists.",
            _key: 0,
          },
          {
            date: "2026-03-07",
            merchant: "Bakery",
            name: "Bread",
            category: "Food",
            amount_kd: "0.750",
            _key: 1,
          },
        ]}
        onImportComplete={onImportComplete}
        categories={["Food"]}
        merchants={["Cafe", "Bakery"]}
      />
    )

    expect(screen.getByText("1 duplicate")).toBeInTheDocument()
    expect(screen.getByText("Duplicate")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Issue details" }))
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent === "Likely duplicate in your account: Duplicate row already exists."
      ).length
    ).toBeGreaterThan(0)
    expect(screen.getByText("Duplicate row already exists.")).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Include row 1 in import" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Approve & Import 1" }))

    await waitFor(() => {
      expect(mocks.uploadApi.importCommit).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            date: "2026-03-07",
            name: "Bread",
          }),
        ],
        [],
        { replaceDemoData: false, atomic: true, fileHash: undefined }
      )
    })
    expect(onImportComplete).toHaveBeenCalledTimes(1)
  })

  it("shows the likely re-import warning when most rows match existing transactions", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          ...Array.from({ length: 8 }, (_, idx) => ({
            date: "2026-03-06",
            merchant: `Cafe ${idx + 1}`,
            name: `Coffee ${idx + 1}`,
            category: "Food",
            amount_kd: "1.250",
            likely_dup: true,
            duplicate_reason: "import_row_duplicate_existing",
            duplicate_message: "Duplicate row already exists.",
            _key: idx,
          })),
          ...Array.from({ length: 2 }, (_, idx) => ({
            date: "2026-03-07",
            merchant: `Bakery ${idx + 1}`,
            name: `Bread ${idx + 1}`,
            category: "Food",
            amount_kd: "0.750",
            _key: idx + 8,
          })),
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe", "Bakery"]}
      />
    )

    expect(screen.getByText("This file looks like it was already imported.")).toBeInTheDocument()
    expect(
      screen.getByText("8 of 10 rows match existing transactions. Review carefully before importing.")
    ).toBeInTheDocument()
    expect(screen.getByText("8 duplicates")).toBeInTheDocument()
  })

  it("offers undo after a successful batch import", async () => {
    const onImportComplete = vi.fn()
    const onOpenChange = vi.fn()
    mocks.uploadApi.importCommit.mockResolvedValue({
      ok: true,
      imported: 2,
      created: 2,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      skipped_duplicate: 0,
      skipped_idempotent: 0,
      import_batch_id: "11111111-1111-1111-1111-111111111111",
    })
    mocks.uploadApi.deleteImportBatch.mockResolvedValue({
      ok: true,
      deleted_count: 2,
    })

    render(
      <PreviewImportDialog
        open
        onOpenChange={onOpenChange}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={onImportComplete}
        categories={["Food"]}
        merchants={["Cafe"]}
        fileHash="preview-file-hash"
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Approve & Import 1" }))

    await waitFor(() => {
      expect(mocks.uploadApi.importCommit).toHaveBeenCalledWith(
        expect.any(Array),
        [],
        { replaceDemoData: false, atomic: true, fileHash: "preview-file-hash" }
      )
    })

    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "2 transactions imported.",
        expect.objectContaining({
          label: "Undo",
          durationMs: 60000,
          onClick: expect.any(Function),
        })
      )
    })

    const undoAction = mocks.toast.success.mock.calls[0]?.[1]
    expect(undoAction).toBeTruthy()
    undoAction.onClick()

    await waitFor(() => {
      expect(mocks.uploadApi.deleteImportBatch).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111"
      )
    })

    expect(onImportComplete).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.toast.success).toHaveBeenLastCalledWith("2 imported transactions removed.")
  })

  it("renders fuzzy duplicate warnings with the softer label", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee Hse",
            category: "Food",
            amount_kd: "1.250",
            likely_dup: true,
            duplicate_reason: "import_row_duplicate_fuzzy_existing",
            duplicate_message: "Potential match with an existing transaction.",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
      />
    )

    expect(screen.getByText("Potential duplicate")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Issue details" }))
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent === "Potential duplicate in your account: Potential match with an existing transaction."
      ).length
    ).toBeGreaterThan(0)
    expect(screen.getByText("Potential match with an existing transaction.")).toBeInTheDocument()
  })

  it("surfaces file-size guidance from upload preview errors", async () => {
    mocks.uploadApi.preview.mockRejectedValue(
      new ApiError("File contains 5,000 rows.", 400, "FILE_TOO_LARGE", {
        max_rows: 2000,
        row_count: 5000,
      })
    )

    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        onPreviewReady={vi.fn()}
      />
    )

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["date,name,amount_kd\n2026-03-06,Coffee,1.250"], "big.csv", { type: "text/csv" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview & Import" }))

    expect(
      await screen.findByText(
        "This file has 5,000 rows. Split it into files with 2,000 rows or fewer and try again."
      )
    ).toBeInTheDocument()
  })

  it("shows the import row limit before upload", () => {
    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        onPreviewReady={vi.fn()}
      />
    )

    expect(
      screen.getByText("Maximum 10,000 rows per import. Preview shows up to 2,000 rows at a time for review.")
    ).toBeInTheDocument()
  })

  it("warns before upload when a CSV appears to exceed the import row limit", async () => {
    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        onPreviewReady={vi.fn()}
      />
    )

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()

    const csvRows = [
      "date,name,amount_kd",
      ...Array.from({ length: 10001 }, (_, idx) => `2026-03-06,Coffee ${idx + 1},1.250`),
    ].join("\n")

    fireEvent.change(fileInput!, {
      target: {
        files: [new File([csvRows], "too-many-rows.csv", { type: "text/csv" })],
      },
    })

    expect(
      await screen.findByText(
        "This CSV appears to contain 10,001 data rows. The maximum per import is 10,000 rows. Split it into smaller files before uploading."
      )
    ).toBeInTheDocument()
  })

  it("shows how many rows were omitted when preview is capped", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
        capped
        totalCount={4500}
        rowsTruncated={2500}
      />
    )

    expect(
      screen.getByText(
        "Preview shows the first 2,000 of 4,500 rows. Split your source file into batches of 10,000 or fewer to import everything."
      )
    ).toBeInTheDocument()
  })

  it("shows a compact excluded-row issue chip when the backend reports negative/zero amount rows", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
        flaggedCount={3}
      />
    )

    expect(screen.getByRole("button", { name: "3 rows excluded: zero or negative amounts" })).toBeInTheDocument()
  })

  it("shows singular excluded-row issue copy for a single flagged row", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
        flaggedCount={1}
      />
    )

    expect(screen.getByRole("button", { name: "1 row excluded: zero or negative amount" })).toBeInTheDocument()
  })

  it("does not show excluded-row issue copy when flaggedCount is 0", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
        flaggedCount={0}
      />
    )

    expect(screen.queryByRole("button", { name: /zero or negative amount/i })).not.toBeInTheDocument()
  })

  it("opens the column mapping step when preview reports missing required columns", async () => {
    mocks.uploadApi.preview.mockRejectedValueOnce(
      new ApiError("Missing required columns: name.", 400, "MISSING_COLUMNS", {
        all_columns: ["Booking Date", "Narrative", "Debit Amount"],
        suggested_mapping: { date: "Booking Date" },
        raw_rows: [{ "Booking Date": "2026-03-06", Narrative: "Coffee", "Debit Amount": "1.250" }],
      })
    )

    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        onPreviewReady={vi.fn()}
      />
    )

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["Booking Date,Narrative,Debit Amount\n2026-03-06,Coffee,1.250"], "bank.csv", { type: "text/csv" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview & Import" }))

    expect(await screen.findByText("Map your columns")).toBeInTheDocument()
    expect(screen.getAllByText("Booking Date").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Narrative").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Debit Amount").length).toBeGreaterThan(0)
  })

  it("shows skipped preview row diagnostics when the backend returns them", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
        skippedRows={[
          {
            row_number: 2,
            reason: "Invalid date format: Cannot parse date: '11/31/2026'",
            name: "Broken Date",
            raw_date: "11/31/2026",
            raw_amount: "2.500",
          },
        ]}
      />
    )

    expect(screen.getByRole("button", { name: "1 row could not load" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "1 row could not load" }))
    expect(screen.getByText("Row 2")).toBeInTheDocument()
    expect(screen.getByText("Invalid date format: Cannot parse date: '11/31/2026'")).toBeInTheDocument()
  })

  it("shows atomic import diagnostics when the backend rejects a mixed batch", async () => {
    mocks.uploadApi.importCommit.mockRejectedValueOnce(
      new ApiError(
        "Import blocked. Fix or exclude the flagged rows, then try again.",
        409,
        "import_atomic_precheck_failed",
        {
          row_results: [
            {
              row_index: 1,
              status: "skipped_duplicate",
              error_code: "import_row_duplicate_existing",
              message: "Duplicate row already exists.",
            },
          ],
          summary: {
            total_rows: 2,
            planned_rows: 1,
            skipped_duplicate: 1,
          },
        }
      )
    )

    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
          {
            date: "2026-03-07",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 1,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Approve & Import 2" }))

    expect(await screen.findByText("Import blocked. Fix or exclude the flagged rows, then try again.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "View details" }))
    expect(await screen.findByText("Row 2")).toBeInTheDocument()
    expect(screen.getByText("Duplicate row already exists.")).toBeInTheDocument()
  })

  it("shows only issue rows when the filter is enabled and restores all rows when disabled", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            _key: 0,
          },
          {
            date: "2026-03-07",
            merchant: "Cafe",
            name: "Coffee Again",
            category: "Food",
            amount_kd: "1.250",
            likely_dup: true,
            duplicate_reason: "import_row_duplicate_existing",
            duplicate_message: "Duplicate row already exists.",
            _key: 1,
          },
          {
            date: "2026-03-08",
            merchant: "Bakery",
            name: "Bread",
            category: "Food",
            amount_kd: "0.750",
            _key: 2,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe", "Bakery"]}
      />
    )

    expect(screen.getAllByText(/Transaction \d+/)).toHaveLength(3)

    fireEvent.click(screen.getByRole("button", { name: "Issues only" }))

    expect(screen.getByText("Reviewing 1 of 3 rows")).toBeInTheDocument()
    expect(screen.getAllByText(/Transaction \d+/)).toHaveLength(1)
    expect(screen.getByText("Transaction 2")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "All rows" }))

    expect(screen.getAllByText(/Transaction \d+/)).toHaveLength(3)
  })

  it("updates the sticky summary counts and import button label as rows are excluded", () => {
    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          {
            date: "2026-03-06",
            merchant: "Cafe",
            name: "Coffee",
            category: "Food",
            amount_kd: "1.250",
            likely_dup: true,
            duplicate_reason: "import_row_duplicate_existing",
            duplicate_message: "Duplicate row already exists.",
            _key: 0,
          },
          {
            date: "2026-03-07",
            merchant: "Bakery",
            name: "Bread",
            category: "Food",
            amount_kd: "0.750",
            _key: 1,
          },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe", "Bakery"]}
      />
    )

    expect(screen.getByText("2 ready")).toBeInTheDocument()
    expect(screen.getByText("1 duplicate")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve & Import 2" })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Include row 1 in import" })[0])

    expect(screen.getByText("1 ready")).toBeInTheDocument()
    expect(screen.getAllByText("1 excluded").length).toBeGreaterThan(0)
    expect(screen.queryByText("1 duplicate")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve & Import 1" })).toBeInTheDocument()
  })

  it("compresses blocked atomic diagnostics into a single summary line", async () => {
    mocks.uploadApi.importCommit.mockRejectedValueOnce(
      new ApiError(
        "Import blocked. Fix or exclude the flagged rows, then try again.",
        409,
        "import_atomic_precheck_failed",
        {
          row_results: [
            {
              row_index: 0,
              status: "blocked_atomic",
              error_code: "import_atomic_pending",
              message: "This row was not saved because another row in the batch needs attention.",
            },
            {
              row_index: 1,
              status: "skipped_invalid",
              error_code: "import_row_invalid_value",
              message: "Amount must be greater than zero",
            },
            {
              row_index: 2,
              status: "blocked_atomic",
              error_code: "import_atomic_pending",
              message: "This row was not saved because another row in the batch needs attention.",
            },
            {
              row_index: 3,
              status: "blocked_atomic",
              error_code: "import_atomic_pending",
              message: "This row was not saved because another row in the batch needs attention.",
            },
          ],
          summary: {
            total_rows: 4,
            planned_rows: 3,
            skipped_invalid: 1,
          },
        }
      )
    )

    render(
      <PreviewImportDialog
        open
        onOpenChange={vi.fn()}
        initialRows={[
          { date: "2026-03-06", merchant: "Cafe", name: "Coffee 1", category: "Food", amount_kd: "1.250", _key: 0 },
          { date: "2026-03-07", merchant: "Cafe", name: "Coffee 2", category: "Food", amount_kd: "1.250", _key: 1 },
          { date: "2026-03-08", merchant: "Cafe", name: "Coffee 3", category: "Food", amount_kd: "1.250", _key: 2 },
          { date: "2026-03-09", merchant: "Cafe", name: "Coffee 4", category: "Food", amount_kd: "1.250", _key: 3 },
        ]}
        onImportComplete={vi.fn()}
        categories={["Food"]}
        merchants={["Cafe"]}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Approve & Import 4" }))

    expect(await screen.findByText("Import blocked. Fix or exclude the flagged rows, then try again.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "View details" }))
    expect(await screen.findByText("Row 2")).toBeInTheDocument()
    expect(screen.getByText("Amount must be greater than zero")).toBeInTheDocument()
    expect(screen.getByText("3 other rows were not imported because of the issue above.")).toBeInTheDocument()
    expect(screen.queryByText("Row 1")).not.toBeInTheDocument()
    expect(screen.queryByText("Row 3")).not.toBeInTheDocument()
    expect(screen.queryByText("Row 4")).not.toBeInTheDocument()
  })
})

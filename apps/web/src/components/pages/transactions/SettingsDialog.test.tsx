// MOB-R91 D — the categories and places manager: one row of tabs; one "Find or add" box that filters and offers
// Add "<text>" when nothing matches exactly; rows with the initial tile, the name and "N expenses"; a tap opens the
// item's own screen (Name, Used in, Merge into another …, Delete … in red); Back returns with the search kept.
// Places rename in place; categories cannot be renamed through today's API (D3). The word is "place" (D4).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { nameColour } from "@/lib/tile-colours"

const mocks = vi.hoisted(() => ({
  categoriesList: vi.fn(),
  categoriesCreate: vi.fn(),
  merchantsList: vi.fn(),
  merchantsUpdate: vi.fn(),
  merchantsDelete: vi.fn(),
  memorizedList: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    categoriesApi: { list: mocks.categoriesList, create: mocks.categoriesCreate, delete: vi.fn(), remap: vi.fn() },
    merchantsApi: { list: mocks.merchantsList, create: vi.fn(), update: mocks.merchantsUpdate, delete: mocks.merchantsDelete, remap: vi.fn() },
    memorizedApi: { list: mocks.memorizedList, pin: vi.fn(), delete: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))

import SettingsDialog from "./SettingsDialog"

const renderDialog = () => render(<SettingsDialog open onOpenChange={vi.fn()} onRefresh={vi.fn()} />)
const tab = (name: string) => screen.getByRole("button", { name, pressed: false })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.categoriesList.mockResolvedValue([
    { id: 1, name: "Groceries", transaction_count: 3, counts_as_income: false },
    { id: 2, name: "Coffee", transaction_count: 1, counts_as_income: false },
    { id: 3, name: "Salary", transaction_count: 4, counts_as_income: true, is_income: true },
  ])
  mocks.categoriesCreate.mockResolvedValue({ id: 9, name: "Gifts" })
  mocks.merchantsList.mockResolvedValue([{ id: 11, name: "Talabat", expense_count: 1 }, { id: 12, name: "Lulu", expense_count: 9 }])
  mocks.merchantsUpdate.mockResolvedValue({ item: { id: 11, name: "Talabat Mart" } })
  mocks.merchantsDelete.mockResolvedValue({ deleted: true })
  mocks.memorizedList.mockResolvedValue({ items: [{ id: 5, canonical: "Flat white", count: 2, is_pinned: false, merchant: { name: "Lulu" }, category: { name: "Coffee" } }], total: 1, has_more: false })
})

describe("categories and places manager (MOB-R91 D)", () => {
  it("one row of tabs, Categories · Places · Memorized, and the word is place", async () => {
    renderDialog()
    expect(screen.getByRole("heading", { name: "Categories & places" })).toBeInTheDocument()
    const tabs = ["Categories", "Places", "Memorized"].map((n) => screen.getByRole("button", { name: n }))
    expect(tabs[0].parentElement!.className.split(/\s+/)).toContain("grid-cols-3")
    expect(tabs.every((t) => t.parentElement === tabs[0].parentElement)).toBe(true)
    expect(screen.queryByText(/merchant/i)).toBeNull()
    await screen.findByText("Groceries")
  })

  it("the box filters, offers Add for new text only, and Add creates the category", async () => {
    renderDialog()
    const box = await screen.findByRole("textbox", { name: "Find or add a category" })
    await screen.findByText("Groceries")
    fireEvent.change(box, { target: { value: "cof" } })
    expect(screen.getByText("Coffee")).toBeInTheDocument()
    expect(screen.queryByText("Groceries")).toBeNull()
    expect(screen.getByRole("button", { name: 'Add "cof"' })).toBeInTheDocument()
    fireEvent.change(box, { target: { value: "  COFFEE " } })
    expect(screen.queryByRole("button", { name: /^Add "/ })).toBeNull()
    fireEvent.change(box, { target: { value: "Gifts" } })
    fireEvent.click(screen.getByRole("button", { name: 'Add "Gifts"' }))
    await waitFor(() => expect(mocks.categoriesCreate).toHaveBeenCalledWith("Gifts"))
  })

  it("a row shows N expenses (none for income); its screen has Name, Used in, Merge and Delete, and no rename", async () => {
    renderDialog()
    const row = (await screen.findByText("Groceries")).closest("button")!
    expect(row).toHaveTextContent("3 expenses")
    expect(screen.getByText("Coffee").closest("button")).toHaveTextContent("1 expense")
    expect(screen.getByText("Salary").closest("button")!.textContent).not.toMatch(/expense/)
    fireEvent.click(row)
    const detail = screen.getByTestId("manage-detail")
    expect(within(detail).getByRole("heading", { name: "Groceries" })).toBeInTheDocument()
    expect(within(detail).getByText("Used in")).toBeInTheDocument()
    expect(within(detail).getByText("3 expenses")).toBeInTheDocument()
    expect(within(detail).getByRole("button", { name: "Merge into another category" })).toBeInTheDocument()
    const del = within(detail).getByRole("button", { name: "Delete category" })
    expect(del.className.split(/\s+/)).toContain("text-destructive")
    expect(within(detail).queryByRole("textbox")).toBeNull()
    // The tab row steps aside while the item's own screen is open.
    expect(screen.queryByRole("button", { name: "Places" })).toBeNull()
  })

  it("Back returns to the list with the search kept", async () => {
    renderDialog()
    const box = await screen.findByRole("textbox", { name: "Find or add a category" })
    await screen.findByText("Groceries")
    fireEvent.change(box, { target: { value: "gro" } })
    fireEvent.click(screen.getByText("Groceries").closest("button")!)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByRole("textbox", { name: "Find or add a category" })).toHaveValue("gro")
    expect(screen.queryByText("Coffee")).toBeNull()
    expect(screen.getByRole("button", { name: "Places" })).toBeInTheDocument()
  })

  it("a place row says how many expenses it holds, and its screen says it under Used in, as plain text (MOB-R92 E3)", async () => {
    renderDialog()
    fireEvent.click(tab("Places"))
    const lulu = (await screen.findByText("Lulu")).closest("button")!
    expect(lulu).toHaveTextContent("9 expenses")
    expect(screen.getByText("Talabat").closest("button")).toHaveTextContent("1 expense")
    fireEvent.click(lulu)
    const detail = screen.getByTestId("manage-detail")
    const usedIn = within(detail).getByText("Used in").parentElement!
    expect(usedIn).toHaveTextContent("9 expenses")
    expect(within(usedIn).queryByRole("link")).toBeNull()
    expect(within(usedIn).queryByRole("button")).toBeNull()
  })

  it("a place keeps its Log-screen colour and renames in place; Save shows only once the name changes", async () => {
    renderDialog()
    fireEvent.click(tab("Places"))
    const row = (await screen.findByText("Talabat")).closest("button")!
    expect(within(row).getByTestId("manage-tile").className.split(/\s+/)).toContain(nameColour("Talabat"))
    fireEvent.click(row)
    const name = screen.getByRole("textbox", { name: "Name" })
    expect(name).toHaveValue("Talabat")
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    fireEvent.change(name, { target: { value: "Talabat Mart" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.merchantsUpdate).toHaveBeenCalledWith(11, "Talabat Mart"))
  })

  it("Delete place asks \"Delete this place?\", deletes, and returns to the list", async () => {
    renderDialog()
    fireEvent.click(tab("Places"))
    fireEvent.click((await screen.findByText("Lulu")).closest("button")!)
    fireEvent.click(screen.getByRole("button", { name: "Delete place" }))
    const confirm = await screen.findByRole("dialog", { name: "Delete this place?" })
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(mocks.merchantsDelete).toHaveBeenCalledWith(12, undefined))
    await waitFor(() => expect(screen.queryByTestId("manage-detail")).toBeNull())
    expect(screen.getByRole("textbox", { name: "Find or add a place" })).toBeInTheDocument()
  })

  it("Memorized keeps its actions as rows: 44px buttons, no list box scrolling inside the dialog", async () => {
    renderDialog()
    fireEvent.click(tab("Memorized"))
    await screen.findByText("Flat white")
    for (const name of ["Pin to top", "Delete"]) {
      expect(screen.getByRole("button", { name }).className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    }
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>(".overflow-y-auto"))
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].contains(screen.getByText("Flat white"))).toBe(true)
  })
})

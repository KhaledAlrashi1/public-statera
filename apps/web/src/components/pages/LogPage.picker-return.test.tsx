// MOB-R78 D, as the operator chose in MOB-R80 B — adding a new place or category on /log, both pickers.
// Return (Enter on computers) picks the first entry listed, or adds the typed text when none is listed; it
// never saves the expense. The Add button sits at the top and shows whenever the typed text has no exact
// match (any letter case), so "Pizza" can be added while "Pizza Hut" is listed. Closing the keyboard with
// nothing typed closes the search (MOB-R70 E5); with text typed it keeps the text and the Add button.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({
  logSuggestions: vi.fn(),
  create: vi.fn(),
  categoriesList: vi.fn(),
  categoriesCreate: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: mocks.categoriesCreate },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function renderLog() {
  render(
    <MemoryRouter initialEntries={["/log"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const line = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) })
const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter", code: "Enter" })
const placeAdd = (text: string) => screen.queryByRole("button", { name: `Add “${text}” as a new place` })
const categoryAdd = (text: string) => screen.queryByRole("button", { name: `Add “${text}” as a new category` })

const openPlace = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
  return screen.getByRole("textbox", { name: "Search places" })
}
const openCategory = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Category/ }))
  return screen.getByRole("textbox", { name: "Find a category" })
}
// Amount 4 and category Coffee: the form is ready, so a Return that reached Save would save.
const makeReady = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Amount/ }))
  fireEvent.click(screen.getByRole("button", { name: "4" }))
  const field = await openCategory()
  fireEvent.click(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: "Coffee" }))
  expect(field).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Save KD 4\.000/ })).toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  mocks.logSuggestions.mockResolvedValue([
    { name: "Pizza Hut", category: "Food Delivery", count: 3, items: [] },
    { name: "Talabat", category: "Food Delivery", count: 2, items: [] },
  ])
  mocks.categoriesList.mockResolvedValue([
    { id: 1, name: "Coffee", kind: "expense", transaction_count: 3 },
    { id: 2, name: "Groceries", kind: "expense", transaction_count: 2 },
  ])
  mocks.categoriesCreate.mockResolvedValue({ id: 9, name: "Pets" })
  mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
})

describe("/log place picker (MOB-R80 B)", () => {
  it("Return adds the typed place when none is listed", async () => {
    renderLog()
    const field = await openPlace()
    fireEvent.change(field, { target: { value: "Bakery" } })
    enter(field)
    expect(line("Place")).toHaveTextContent("Bakery")
    expect(screen.getByText("What kind of spending is Bakery?")).toBeInTheDocument()
  })

  it("\"Pizza\" with \"Pizza Hut\" listed shows Add \"Pizza\" at the top, and Return picks Pizza Hut", async () => {
    renderLog()
    const field = await openPlace()
    fireEvent.change(field, { target: { value: "Pizza" } })
    const list = within(screen.getByRole("group", { name: "Place" })).getAllByRole("button").map((b) => b.textContent ?? "")
    const add = list.indexOf("Add “Pizza” as a new place")
    expect(add).toBeGreaterThanOrEqual(0)
    expect(add).toBeLessThan(list.findIndex((t) => t.startsWith("Pizza Hut")))
    enter(field)
    expect(line("Place")).toHaveTextContent("Pizza Hut")
    expect(line("Category")).toHaveTextContent("Food Delivery")
  })

  it("an exact name, in any letter case, shows no Add", async () => {
    renderLog()
    const field = await openPlace()
    fireEvent.change(field, { target: { value: "  pIZZA hUT " } })
    expect(placeAdd("pIZZA hUT")).toBeNull()
    expect(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^Pizza Hut/ })).toBeInTheDocument()
  })

  it("closing the keyboard with nothing typed closes the search", async () => {
    renderLog()
    const field = await openPlace()
    field.focus()
    fireEvent.blur(field)
    expect(screen.queryByRole("textbox", { name: "Search places" })).toBeNull()
    expect(line("Place")).toHaveTextContent("Shop or app")
  })

  it("closing the keyboard with text typed keeps the text and the Add button, and adds nothing", async () => {
    renderLog()
    const field = await openPlace()
    field.focus()
    fireEvent.change(field, { target: { value: "Bakery" } })
    fireEvent.blur(field)
    expect(screen.getByRole("textbox", { name: "Search places" })).toHaveValue("Bakery")
    expect(placeAdd("Bakery")).toBeInTheDocument()
    expect(line("Place")).toHaveTextContent("Shop or app")
  })

  it("Return never saves the expense", async () => {
    renderLog()
    await makeReady()
    const field = await openPlace()
    enter(field) // nothing typed
    fireEvent.change(field, { target: { value: "Bakery" } })
    enter(field)
    expect(line("Place")).toHaveTextContent("Bakery")
    await waitFor(() => expect(mocks.create).not.toHaveBeenCalled())
  })
})

describe("/log category picker (MOB-R80 B)", () => {
  it("Return adds the typed category when none is listed", async () => {
    renderLog()
    const field = await openCategory()
    fireEvent.change(field, { target: { value: "Pets" } })
    enter(field)
    await waitFor(() => expect(mocks.categoriesCreate).toHaveBeenCalledWith("Pets"))
    await waitFor(() => expect(line("Category")).toHaveTextContent("Pets"))
  })

  it("\"Co\" with Coffee listed shows the Add button at the top, and Return picks Coffee", async () => {
    renderLog()
    const field = await openCategory()
    fireEvent.change(field, { target: { value: "Co" } })
    const buttons = within(screen.getByRole("group", { name: "Category" })).getAllByRole("button").map((b) => b.textContent)
    expect(buttons).toContain("Add “Co” as a new category")
    expect(buttons.indexOf("Add “Co” as a new category")).toBeLessThan(buttons.indexOf("Coffee"))
    enter(field)
    expect(line("Category")).toHaveTextContent("Coffee")
    expect(mocks.categoriesCreate).not.toHaveBeenCalled()
  })

  it("an exact name, in any letter case, shows no Add", async () => {
    renderLog()
    const field = await openCategory()
    fireEvent.change(field, { target: { value: " cOFFEE " } })
    expect(categoryAdd("cOFFEE")).toBeNull()
    expect(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: "Coffee" })).toBeInTheDocument()
  })

  it("closing the keyboard with nothing typed closes the search", async () => {
    renderLog()
    const field = await openCategory()
    field.focus()
    fireEvent.blur(field)
    expect(screen.queryByRole("textbox", { name: "Find a category" })).toBeNull()
    expect(line("Category")).toHaveAttribute("aria-expanded", "false")
  })

  it("closing the keyboard with text typed keeps the text and the Add button, and adds nothing", async () => {
    renderLog()
    const field = await openCategory()
    field.focus()
    fireEvent.change(field, { target: { value: "Pets" } })
    fireEvent.blur(field)
    expect(screen.getByRole("textbox", { name: "Find a category" })).toHaveValue("Pets")
    expect(categoryAdd("Pets")).toBeInTheDocument()
    expect(mocks.categoriesCreate).not.toHaveBeenCalled()
  })

  it("Return never saves the expense", async () => {
    renderLog()
    await makeReady()
    const field = await openCategory()
    enter(field) // nothing typed
    fireEvent.change(field, { target: { value: "Gro" } })
    enter(field)
    expect(line("Category")).toHaveTextContent("Groceries")
    await waitFor(() => expect(mocks.create).not.toHaveBeenCalled())
  })
})

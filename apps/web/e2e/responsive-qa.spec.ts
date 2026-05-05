import { expect, test, devices, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

const APP_ROUTES: Array<{ label: string; path: string }> = [
  { label: "dashboard", path: "/" },
  { label: "activity", path: "/activity?type=all" },
  { label: "plan", path: "/plan" },
  { label: "insights", path: "/insights" },
  { label: "spending-intelligence", path: "/spending-intelligence" },
  { label: "profile", path: "/profile" },
]

type ClientErrors = {
  consoleErrors: string[]
  pageErrors: string[]
}

function attachClientErrorCapture(page: Page): ClientErrors {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text())
    }
  })

  page.on("pageerror", (error) => {
    pageErrors.push(error.message)
  })

  return { consoleErrors, pageErrors }
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))

  expect(
    Math.max(metrics.doc, metrics.body),
    `${label} overflowed horizontally (viewport ${metrics.viewport}, doc ${metrics.doc}, body ${metrics.body})`
  ).toBeLessThanOrEqual(metrics.viewport + 4)
}

async function registerAndLoadDemoWorkspace(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  const workspaceChoiceButton = page.getByRole("button", { name: "Load demo workspace" })
  const dashboardDemoButton = page.getByRole("button", { name: /Load demo workspace/i }).first()

  try {
    await expect(workspaceChoiceButton).toBeVisible({ timeout: 8_000 })
    await workspaceChoiceButton.click()
  } catch {
    if (await dashboardDemoButton.isVisible().catch(() => false)) {
      await dashboardDemoButton.click()
    }
  }

  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  await expect(page.locator(".section-panel").first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(750)
}

async function visitAndCheckRoute(page: Page, label: string, path: string) {
  await page.goto(path)
  await expect(page.locator(".section-panel").first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await expectNoHorizontalOverflow(page, label)
}

async function runRouteSweep(page: Page) {
  for (const route of APP_ROUTES) {
    await visitAndCheckRoute(page, route.label, route.path)
  }
}

async function assertNoClientErrors(errors: ClientErrors) {
  expect(errors.pageErrors, "Unexpected uncaught page errors").toEqual([])
  expect(errors.consoleErrors, "Unexpected console errors").toEqual([])
}

test.describe.configure({ mode: "serial" })

test("desktop route sweep stays stable", async ({ page }) => {
  const errors = attachClientErrorCapture(page)

  await page.setViewportSize({ width: 1440, height: 900 })
  await registerAndLoadDemoWorkspace(page, `responsive-desktop-${Date.now()}@example.com`)
  await runRouteSweep(page)

  await assertNoClientErrors(errors)
})

test("mobile route sweep has no horizontal overflow and key interactions fit", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] })
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)

  try {
    await registerAndLoadDemoWorkspace(page, `responsive-mobile-${Date.now()}@example.com`)
    await runRouteSweep(page)

    await page.goto("/activity?type=all")
    const filtersButton = page.getByRole("button", { name: "Filters" })
    await expect(filtersButton).toBeVisible()
    await filtersButton.click()
    await expect(filtersButton).toHaveAttribute("aria-expanded", "true")
    await expectNoHorizontalOverflow(page, "activity filters")

    const addButton = page.getByRole("button", { name: /Add (Transaction|Expense|Income)/i }).first()
    await addButton.click()
    const addDialog = page.getByRole("dialog", { name: /Add (Transaction|Expense|Income)/i })
    await expect(addDialog).toBeVisible()
    await expectNoHorizontalOverflow(page, "activity add dialog")

    await page.goto("/register")
    await expectNoHorizontalOverflow(page, "register")

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

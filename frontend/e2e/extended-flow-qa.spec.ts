import { devices, expect, test, type Browser, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

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

async function assertNoClientErrors(errors: ClientErrors) {
  expect(errors.pageErrors, "Unexpected uncaught page errors").toEqual([])
  expect(errors.consoleErrors, "Unexpected console errors").toEqual([])
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function resolveWorkspaceChoice(page: Page, mode: "empty" | "demo") {
  const emptyButton = page.getByRole("button", { name: "Start with my own data" })
  const demoButton = page.getByRole("button", { name: "Load demo workspace" })

  await page.waitForTimeout(300)
  const emptyVisible = await emptyButton.isVisible().catch(() => false)
  const demoVisible = await demoButton.isVisible().catch(() => false)

  if (!emptyVisible && !demoVisible) {
    return
  }

  if (mode === "demo") {
    await demoButton.click()
  } else {
    await emptyButton.click()
  }
}

async function registerAndEnterApp(page: Page, email: string, mode: "empty" | "demo" = "empty") {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForFunction(() => {
    return window.location.pathname === "/" || window.location.pathname === "/welcome"
  }, undefined, { timeout: 20_000 })

  await resolveWorkspaceChoice(page, mode)
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  await expect(page.locator(".section-panel").first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
}

async function createMobileContext(browser: Browser) {
  return browser.newContext({ ...devices["iPhone 13"] })
}

async function getFeatureFlags(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" })
    if (!response.ok) return { enable_open_banking: false }
    const payload = await response.json() as { flags?: { enable_open_banking?: boolean } }
    return {
      enable_open_banking: !!payload.flags?.enable_open_banking,
    }
  })
}

test.describe.configure({ mode: "serial" })

test("transaction settings dialog works cleanly on mobile", async ({ browser }) => {
  const context = await createMobileContext(browser)
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)

  try {
    const stamp = Date.now()
    const categoryName = `QA Mobile Category ${stamp}`
    const merchantName = `QA Mobile Merchant ${stamp}`

    await registerAndEnterApp(page, `settings-mobile-${stamp}@example.com`)
    await page.goto("/activity?type=all")

    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog", { name: "Settings" })
    await expect(dialog).toBeVisible()
    await expectNoHorizontalOverflow(page, "transaction settings dialog")

    await dialog.getByPlaceholder("New category name").fill(categoryName)
    await dialog.getByRole("button", { name: "Add" }).click()
    await expect(page.getByText(`Category "${categoryName}" created.`)).toBeVisible()
    await expect(dialog).toContainText(categoryName)

    await dialog.getByRole("button", { name: "Merchants" }).click()
    await dialog.getByPlaceholder("New merchant name").fill(merchantName)
    await dialog.getByRole("button", { name: "Add" }).click()
    await expect(page.getByText(`Merchant "${merchantName}" created.`)).toBeVisible()
    await expect(dialog).toContainText(merchantName)

    await dialog.getByRole("button", { name: "Memorized" }).click()
    await expect(dialog.getByPlaceholder("Search transaction titles...")).toBeVisible()
    await expectNoHorizontalOverflow(page, "transaction settings memorized tab")

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

test("goals and debt flow supports debt add, edit, and remove", async ({ page }) => {
  const errors = attachClientErrorCapture(page)
  const stamp = Date.now()
  const debtName = `QA Debt ${stamp}`

  await registerAndEnterApp(page, `debt-plan-${stamp}@example.com`)
  await page.goto("/plan?tab=goals")

  await expect(page.getByText("Debt Accounts")).toBeVisible()
  await page.getByRole("button", { name: "Add Debt" }).click()

  const addDialog = page.getByRole("dialog", { name: "Add Debt" })
  await expect(addDialog).toBeVisible()
  await addDialog.getByLabel("Debt name").fill(debtName)
  await addDialog.getByLabel("Debt type").selectOption("credit_card")
  await addDialog.getByLabel("Balance (KD)").fill("450.000")
  await addDialog.getByLabel("Minimum / month (KD)").fill("25.000")
  await addDialog.getByLabel("Due day (1-31)").fill("15")
  await addDialog.getByRole("button", { name: "Add Debt" }).click()

  await expect(page.getByText("Debt account added.")).toBeVisible()
  await expect(page.getByText(debtName)).toBeVisible()
  await expect(page.getByText(/Minimum KD 25\.000/)).toBeVisible()

  const debtRow = page.locator(".inner-card", { hasText: debtName }).first()
  await debtRow.getByRole("button", { name: "Edit" }).click()

  const editDialog = page.getByRole("dialog", { name: "Edit Debt" })
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel("Minimum / month (KD)").fill("30.000")
  await editDialog.getByRole("button", { name: "Save Changes" }).click()

  await expect(page.getByText("Debt account updated.")).toBeVisible()
  await expect(page.getByText(/Minimum KD 30\.000/)).toBeVisible()

  await page.locator(".inner-card", { hasText: debtName }).first().getByRole("button", { name: "Remove" }).click()
  const removeDialog = page.getByRole("dialog", { name: "Remove debt account?" })
  await expect(removeDialog).toBeVisible()
  await removeDialog.getByRole("button", { name: "Remove" }).click()

  await expect(page.getByText("Debt account removed.")).toBeVisible()
  await expect(page.getByText(debtName)).toHaveCount(0)

  await assertNoClientErrors(errors)
})

test("bank page handles current feature state cleanly", async ({ page }) => {
  const errors = attachClientErrorCapture(page)
  const stamp = Date.now()
  const institutionName = `QA Bank ${stamp}`

  await registerAndEnterApp(page, `bank-qa-${stamp}@example.com`)
  await page.goto("/bank")

  await expect(page.getByRole("heading", { name: "Connect banks, preview transactions, and import safely" })).toBeVisible()
  await expectNoHorizontalOverflow(page, "bank page")

  const flags = await getFeatureFlags(page)

  if (!flags.enable_open_banking) {
    await expect(page.getByRole("heading", { name: "Open Banking unavailable" })).toBeVisible()
    await expect(page.getByText("Open Banking is not enabled in this environment.")).toBeVisible()
    await assertNoClientErrors(errors)
    return
  }

  const connectForm = page.locator("form").first()
  const connectButton = connectForm.locator('button[type="submit"]')
  const fakeBankCard = page.getByRole("button", { name: /FakeBank/i }).first()
  if (await fakeBankCard.count()) {
    await fakeBankCard.click()
  }

  await page.getByLabel("Institution name").fill(institutionName)
  await expect(connectButton).toBeEnabled()
  await connectButton.click()

  await expect(page.locator("body")).toContainText(
    new RegExp(`${escapeRegex(`Connected ${institutionName}`)}|Two-factor authentication must be enabled`),
    { timeout: 10_000 }
  )

  const twoFactorMessageVisible = await page.getByText(/Two-factor authentication must be enabled/i).isVisible().catch(() => false)
  if (!twoFactorMessageVisible) {
    await page.getByRole("button", { name: "Run Sync Preview" }).click()
    await expect(page.locator("body")).toContainText(/Staged \d+ row\(s\)\./, { timeout: 10_000 })

    await page.getByRole("button", { name: "Commit Staged Transactions" }).click()
    await expect(page.locator("body")).toContainText(
      /Committed \d+ transaction\(s\), skipped \d+ duplicate\(s\)\./,
      { timeout: 10_000 }
    )

    await page.getByRole("button", { name: "Revoke" }).first().click()
    await expect(page.getByText("Connection revoked.")).toBeVisible({ timeout: 10_000 })
  }

  await assertNoClientErrors(errors)
})

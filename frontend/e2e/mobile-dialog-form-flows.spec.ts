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

async function createMobileContext(browser: Browser) {
  return browser.newContext({ ...devices["iPhone 13"] })
}

async function resolveWorkspaceChoice(page: Page) {
  const ownDataButton = page.getByRole("button", { name: "Start with my own data" })
  const demoButton = page.getByRole("button", { name: "Load demo workspace" })

  await page.waitForTimeout(300)
  const ownDataVisible = await ownDataButton.isVisible().catch(() => false)
  const demoVisible = await demoButton.isVisible().catch(() => false)

  if (!ownDataVisible && !demoVisible) {
    return
  }

  if (ownDataVisible) {
    await ownDataButton.click()
    return
  }

  await demoButton.click()
}

async function registerAndStart(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForFunction(() => {
    return window.location.pathname === "/" || window.location.pathname === "/welcome"
  }, undefined, { timeout: 20_000 })

  await resolveWorkspaceChoice(page)

  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
}

test("mobile activity and income dialogs validate and submit cleanly", async ({ browser }) => {
  const context = await createMobileContext(browser)
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)
  const stamp = Date.now()
  const incomeName = `Mobile Salary ${stamp}`

  try {
    await registerAndStart(page, `mobile-forms-${stamp}@example.com`)

    await page.goto("/activity?type=all")
    await expectNoHorizontalOverflow(page, "mobile activity page")

    await page.getByRole("button", { name: "Add Transaction" }).first().click()
    const addExpenseDialog = page.getByRole("dialog", { name: "Add Expense" })
    await expect(addExpenseDialog).toBeVisible()
    await expectNoHorizontalOverflow(page, "mobile add expense dialog")

    await addExpenseDialog.getByRole("button", { name: "Add Expense" }).click()
    const expenseNameInput = addExpenseDialog.locator('input[placeholder="Item name"]:visible').first()
    const expenseCategoryInput = addExpenseDialog.locator('input[placeholder="Category"]:visible').first()
    const expenseAmountInput = addExpenseDialog.locator('input[placeholder="0.000"]:visible').first()

    await expect(expenseNameInput).toHaveAttribute("aria-invalid", "true")
    await expect(expenseCategoryInput).toHaveAttribute("aria-invalid", "true")
    await expect(expenseAmountInput).toHaveAttribute("aria-invalid", "true")
    await addExpenseDialog.getByRole("button", { name: "Cancel" }).click()
    await expectNoHorizontalOverflow(page, "mobile activity after expense add")

    await page.goto("/income")
    await expectNoHorizontalOverflow(page, "mobile income page")

    await page.getByRole("button", { name: "Add Income" }).first().click()
    const incomeDialog = page.getByRole("dialog", { name: "Add Income" })
    await expect(incomeDialog).toBeVisible()

    const incomeDate = incomeDialog.getByLabel("Date")
    const incomeAmount = incomeDialog.getByLabel("Amount (KD)")
    await incomeDate.fill("")
    await incomeAmount.fill("0")
    await incomeDialog.getByLabel("Name").click()

    await expect(incomeDate).toHaveAttribute("aria-invalid", "true")
    await expect(incomeAmount).toHaveAttribute("aria-invalid", "true")

    await incomeDate.fill(new Date().toISOString().slice(0, 10))
    await incomeAmount.fill("250.000")
    await incomeDialog.getByLabel("Name").fill(incomeName)
    await incomeDialog.getByRole("button", { name: "Add Income" }).click()

    await expect(page.locator("main")).toContainText(incomeName, { timeout: 10_000 })
    await expectNoHorizontalOverflow(page, "mobile income after add")

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

test("mobile plan dialogs validate budget, goal, deposit, and debt flows", async ({ browser }) => {
  const context = await createMobileContext(browser)
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)
  const stamp = Date.now()
  const budgetCategory = `Mobile Budget ${stamp}`
  const goalName = `Mobile Goal ${stamp}`
  const debtName = `Mobile Debt ${stamp}`

  try {
    await registerAndStart(page, `mobile-plan-${stamp}@example.com`)

    await page.goto("/plan")
    await expectNoHorizontalOverflow(page, "mobile plan page")

    await page.getByRole("button", { name: /Add Budget|Add your first budget/i }).first().click()
    const budgetDialog = page.getByRole("dialog", { name: "Add Budget" })
    await expect(budgetDialog).toBeVisible()

    const budgetAmount = budgetDialog.getByLabel("Amount (KD)")
    await budgetDialog.getByRole("button", { name: "Save Budget" }).click()
    await expect(budgetAmount).toHaveAttribute("aria-invalid", "true")

    await budgetDialog.getByLabel("Category").fill(budgetCategory)
    await budgetAmount.fill("180.000")
    await budgetDialog.getByRole("button", { name: "Save Budget" }).click()

    await expect(page.locator("main")).toContainText(budgetCategory)
    await expectNoHorizontalOverflow(page, "mobile plan after budget add")

    await page.goto("/plan?tab=goals")
    await page.getByRole("button", { name: "Add Goal" }).click()

    const goalDialog = page.getByRole("dialog", { name: "Add Savings Goal" })
    await expect(goalDialog).toBeVisible()

    const goalNameInput = goalDialog.getByLabel("Goal name")
    const goalTargetInput = goalDialog.getByLabel("Target amount (KD)")
    await goalDialog.getByRole("button", { name: "Create Goal" }).click()
    await expect(goalNameInput).toHaveAttribute("aria-invalid", "true")
    await expect(goalTargetInput).toHaveAttribute("aria-invalid", "true")

    await goalNameInput.fill(goalName)
    await goalTargetInput.fill("300.000")
    await goalDialog.getByRole("button", { name: "Create Goal" }).click()

    const goalCard = page.locator("article:visible", { hasText: goalName }).first()
    await expect(goalCard).toBeVisible()

    await goalCard.getByRole("button", { name: "Deposit" }).click()
    const depositDialog = page.getByRole("dialog", { name: "Add Deposit" })
    await expect(depositDialog).toBeVisible()

    const depositAmount = depositDialog.getByLabel("Amount (KD)")
    await depositAmount.fill("0")
    await depositDialog.getByRole("button", { name: "Add Deposit" }).click()
    await expect(depositAmount).toHaveAttribute("aria-invalid", "true")

    await depositAmount.fill("25.000")
    await depositDialog.getByRole("button", { name: "Add Deposit" }).click()
    await expect(goalCard).toContainText("KD 25.000 / KD 300.000")

    await page.getByRole("button", { name: "Add Debt" }).first().click()
    const debtDialog = page.getByRole("dialog", { name: "Add Debt" })
    await expect(debtDialog).toBeVisible()
    await expectNoHorizontalOverflow(page, "mobile add debt dialog")

    const debtBalance = debtDialog.getByLabel("Balance (KD)")
    const debtMinimum = debtDialog.getByLabel("Minimum / month (KD)")
    const debtDueDay = debtDialog.getByLabel("Due day (1-31)")
    await debtBalance.fill("-50")
    await debtMinimum.fill("-5")
    await debtDueDay.fill("40")
    await debtDialog.getByRole("button", { name: "Add Debt" }).click()

    await expect(debtBalance).toHaveAttribute("aria-invalid", "true")
    await expect(debtMinimum).toHaveAttribute("aria-invalid", "true")
    await expect(debtDueDay).toHaveAttribute("aria-invalid", "true")

    await debtDialog.getByLabel("Debt name").fill(debtName)
    await debtBalance.fill("450.000")
    await debtMinimum.fill("25.000")
    await debtDueDay.fill("15")
    await debtDialog.getByRole("button", { name: "Add Debt" }).click()

    await expect(page.locator("main")).toContainText(debtName)
    await expectNoHorizontalOverflow(page, "mobile goals and debt after debt add")

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

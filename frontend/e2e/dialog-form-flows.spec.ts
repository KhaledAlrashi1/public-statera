import { expect, test, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

async function registerAndStart(page: Page, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.com`

  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await Promise.race([
    page.waitForURL(/\/welcome$/, { timeout: 20_000 }),
    page.waitForURL(/\/$/, { timeout: 20_000 }),
  ])

  if (page.url().endsWith("/welcome")) {
    await page.getByRole("button", { name: "Start with my own data" }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  } else {
    await expect(page).toHaveURL(/\/$/)
  }
}

test("income dialog shows inline validation and recovers on submit", async ({ page }) => {
  const stamp = Date.now()
  const incomeName = `E2E Salary ${stamp}`

  await registerAndStart(page, "income-dialog")

  await page.goto("/income")
  await page.getByRole("button", { name: "Add Income" }).first().click()

  const dialog = page.getByRole("dialog", { name: "Add Income" })
  await expect(dialog).toBeVisible()

  const dateInput = dialog.getByLabel("Date")
  const amountInput = dialog.getByLabel("Amount (KD)")

  await dateInput.fill("")
  await amountInput.click()
  await amountInput.fill("0")
  await dialog.getByLabel("Name").click()

  await expect(dateInput).toHaveAttribute("aria-invalid", "true")
  await expect(amountInput).toHaveAttribute("aria-invalid", "true")
  await expect(dialog.getByText("Date is required.")).toBeVisible()
  await expect(dialog.getByText("Amount must be greater than zero.")).toBeVisible()

  await dateInput.fill(isoToday())
  await amountInput.fill("125.500")
  await dialog.getByLabel("Name").fill(incomeName)
  await dialog.getByLabel("Name").click()

  await expect(dialog.getByText("Date looks good.")).toBeVisible()
  await expect(dialog.getByText("Amount is ready to save.")).toBeVisible()

  await dialog.getByRole("button", { name: "Add Income" }).click()

  await expect(page.getByText("Income entry added.")).toBeVisible()
  await expect(page.locator("tbody")).toContainText(incomeName)
})

test("activity add and edit dialogs validate line items before saving", async ({ page }) => {
  const stamp = Date.now()
  const originalName = `E2E Coffee ${stamp}`
  const updatedName = `E2E Coffee Updated ${stamp}`
  const category = `Food ${stamp}`

  await registerAndStart(page, "activity-dialog")

  await page.goto("/activity")
  await page.getByRole("button", { name: "Add Transaction" }).first().click()

  const addDialog = page.getByRole("dialog", { name: "Add Expense" })
  await expect(addDialog).toBeVisible()

  await addDialog.getByRole("button", { name: "Add Expense" }).click()

  const addNameInput = addDialog.locator('input[placeholder="Item name"]:visible').first()
  const addCategoryInput = addDialog.locator('input[placeholder="Category"]:visible').first()
  const addAmountInput = addDialog.locator('input[placeholder="0.000"]:visible').first()

  await expect(
    addDialog.getByText("At least one line item with a title, category, and amount is required.")
  ).toBeVisible()
  await expect(addNameInput).toHaveAttribute("aria-invalid", "true")
  await expect(addCategoryInput).toHaveAttribute("aria-invalid", "true")
  await expect(addAmountInput).toHaveAttribute("aria-invalid", "true")

  await addDialog.getByRole("button", { name: "Cancel" }).click()
  await expect(addDialog).not.toBeVisible()

  await page.getByRole("button", { name: "Add Transaction" }).first().click()
  const freshAddDialog = page.getByRole("dialog", { name: "Add Expense" })
  await expect(freshAddDialog).toBeVisible()

  const freshNameInput = freshAddDialog.locator('input[placeholder="Item name"]:visible').first()
  const freshCategoryInput = freshAddDialog.locator('input[placeholder="Category"]:visible').first()
  const freshAmountInput = freshAddDialog.locator('input[placeholder="0.000"]:visible').first()

  await freshNameInput.fill(originalName)
  await freshCategoryInput.fill(category)
  await freshAmountInput.fill("2.500")
  await freshAddDialog.getByRole("button", { name: "Add Expense" }).click()

  const createdEntry = page.locator("tr:visible, article:visible", { hasText: originalName }).first()
  await expect(createdEntry).toBeVisible({ timeout: 10_000 })
  await createdEntry.getByRole("button", { name: "Edit" }).click()

  const editDialog = page.getByRole("dialog", { name: "Edit Transaction" })
  await expect(editDialog).toBeVisible()

  const editNameInput = editDialog.locator('input[placeholder="Item name"]:visible').first()
  await editNameInput.fill("")
  await editDialog.getByRole("button", { name: "Save Changes" }).click()

  await expect(editDialog.getByText("Complete line item 1 or remove it.")).toBeVisible()
  await expect(editNameInput).toHaveAttribute("aria-invalid", "true")
  await editDialog.getByRole("button", { name: "Cancel" }).click()
  await expect(editDialog).not.toBeVisible()

  await createdEntry.getByRole("button", { name: "Edit" }).click()
  const retryEditDialog = page.getByRole("dialog", { name: "Edit Transaction" })
  await expect(retryEditDialog).toBeVisible()

  const retryEditNameInput = retryEditDialog.locator('input[placeholder="Item name"]:visible').first()
  await retryEditNameInput.fill(updatedName)
  await retryEditDialog.getByRole("button", { name: "Save Changes" }).click()

  await expect(page.locator("tr:visible, article:visible", { hasText: updatedName }).first()).toBeVisible({
    timeout: 10_000,
  })
})

test("plan dialogs validate budget, savings goal, and deposit flows", async ({ page }) => {
  const stamp = Date.now()
  const budgetCategory = `Budget ${stamp}`
  const goalName = `Emergency Goal ${stamp}`

  await registerAndStart(page, "plan-dialog")

  await page.goto("/plan")
  await page.getByRole("button", { name: /Add Budget|Add your first budget/i }).first().click()

  const budgetDialog = page.getByRole("dialog", { name: "Add Budget" })
  await expect(budgetDialog).toBeVisible()

  const budgetAmount = budgetDialog.getByLabel("Amount (KD)")
  await budgetDialog.getByRole("button", { name: "Save Budget" }).click()

  await expect(budgetDialog.getByText("Please fill all fields with valid values.")).toBeVisible()
  await expect(budgetAmount).toHaveAttribute("aria-invalid", "true")
  await expect(budgetDialog.getByText("Budget amount is required.")).toBeVisible()

  await budgetDialog.getByLabel("Category").fill(budgetCategory)
  await budgetAmount.fill("-10")
  await budgetDialog.getByRole("button", { name: "Save Budget" }).click()

  await expect(budgetDialog.getByText("Please enter a valid amount.")).toBeVisible()
  await expect(budgetDialog.getByText("Budget amount cannot be negative.")).toBeVisible()

  await budgetAmount.fill("250")
  await budgetDialog.getByRole("button", { name: "Save Budget" }).click()

  await expect(page.getByText("Budget added.")).toBeVisible()
  await expect(page.locator("tbody")).toContainText(budgetCategory)

  await page.goto("/plan?tab=goals")
  await page.getByRole("button", { name: "Add Goal" }).click()

  const goalDialog = page.getByRole("dialog", { name: "Add Savings Goal" })
  await expect(goalDialog).toBeVisible()

  const goalNameInput = goalDialog.getByLabel("Goal name")
  const goalTargetInput = goalDialog.getByLabel("Target amount (KD)")
  const goalCurrentInput = goalDialog.getByLabel("Current amount (KD)")

  await goalDialog.getByRole("button", { name: "Create Goal" }).click()

  await expect(goalDialog.getByText("Goal name is required.").last()).toBeVisible()
  await expect(goalNameInput).toHaveAttribute("aria-invalid", "true")
  await expect(goalDialog.getByText("Target amount is required.").last()).toBeVisible()
  await expect(goalTargetInput).toHaveAttribute("aria-invalid", "true")

  await goalNameInput.fill(goalName)
  await goalTargetInput.fill("500")
  await goalCurrentInput.fill("100")
  await goalDialog.getByRole("button", { name: "Create Goal" }).click()

  await expect(page.getByText("Savings goal created.")).toBeVisible()

  const goalCard = page.locator("article", { hasText: goalName }).first()
  await expect(goalCard).toBeVisible()
  await expect(goalCard).toContainText("KD 100.000 / KD 500.000")

  await goalCard.getByRole("button", { name: "Deposit" }).click()

  const depositDialog = page.getByRole("dialog", { name: "Add Deposit" })
  await expect(depositDialog).toBeVisible()

  const depositAmountInput = depositDialog.getByLabel("Amount (KD)")
  await depositAmountInput.fill("0")
  await depositDialog.getByRole("button", { name: "Add Deposit" }).click()

  await expect(depositDialog.getByText("Deposit amount must be greater than zero.").last()).toBeVisible()
  await expect(depositAmountInput).toHaveAttribute("aria-invalid", "true")

  await depositAmountInput.fill("50")
  await depositDialog.getByRole("button", { name: "Add Deposit" }).click()

  await expect(page.getByText("Deposit added.")).toBeVisible()
  await expect(goalCard).toContainText("KD 150.000 / KD 500.000")
})

test("debt dialog shows validation feedback before saving", async ({ page }) => {
  const stamp = Date.now()
  const debtName = `E2E Debt ${stamp}`

  await registerAndStart(page, "debt-dialog")

  await page.goto("/plan?tab=goals")
  await page.getByRole("button", { name: "Add Debt" }).first().click()

  const dialog = page.getByRole("dialog", { name: "Add Debt" })
  await expect(dialog).toBeVisible()

  const balanceInput = dialog.getByLabel("Balance (KD)")
  const minimumInput = dialog.getByLabel("Minimum / month (KD)")
  const dueDayInput = dialog.getByLabel("Due day (1-31)")

  await balanceInput.fill("-100")
  await minimumInput.fill("-5")
  await dueDayInput.fill("40")
  await dialog.getByLabel("Notes (optional)").click()

  await expect(balanceInput).toHaveAttribute("aria-invalid", "true")
  await expect(minimumInput).toHaveAttribute("aria-invalid", "true")
  await expect(dueDayInput).toHaveAttribute("aria-invalid", "true")
  await expect(dialog.getByText("Balance cannot be negative.")).toBeVisible()
  await expect(dialog.getByText("Minimum payment cannot be negative.")).toBeVisible()
  await expect(dialog.getByText("Due day must be an integer between 1 and 31.")).toBeVisible()

  await dialog.getByRole("button", { name: "Add Debt" }).click()
  await expect(dialog.getByText("Debt name is required.")).toBeVisible()

  await dialog.getByLabel("Debt name").fill(debtName)
  await balanceInput.fill("450")
  await minimumInput.fill("25")
  await dueDayInput.fill("15")
  await dialog.getByRole("button", { name: "Add Debt" }).click()

  await expect(page.getByText("Debt account added.")).toBeVisible()
  await expect(page.getByText(debtName)).toBeVisible()
})

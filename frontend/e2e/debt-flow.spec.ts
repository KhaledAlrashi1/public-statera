import { expect, test, type Page } from "@playwright/test"

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
  await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill("Password123!")
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForFunction(() => {
    return window.location.pathname === "/" || window.location.pathname === "/welcome"
  }, undefined, { timeout: 20_000 })

  await resolveWorkspaceChoice(page)
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
}

test("adding debt updates the dashboard safe-to-spend card", async ({ page }) => {
  const stamp = Date.now()
  const email = `debt-flow-${stamp}@example.com`
  const budgetCategory = `Debt Budget ${stamp}`
  const debtName = `E2E Debt ${stamp}`

  await registerAndStart(page, email)
  await page.goto("/profile")
  await page.getByLabel("Monthly income (KD)").fill("1200.000")
  await page.getByRole("button", { name: "Save financial settings" }).click()
  await expect(page.getByText("Financial settings saved.")).toBeVisible()

  await page.goto("/plan")
  await page.getByRole("button", { name: /Add Budget|Add your first budget/i }).first().click()
  const budgetDialog = page.getByRole("dialog", { name: "Add Budget" })
  await expect(budgetDialog).toBeVisible()
  await budgetDialog.getByLabel("Category").fill(budgetCategory)
  await budgetDialog.getByLabel("Amount (KD)").fill("500.000")
  await budgetDialog.getByRole("button", { name: "Save Budget" }).click()
  await expect(page.locator("tbody")).toContainText(budgetCategory)

  await page.goto("/")
  const safeToSpendCard = page.locator('section[aria-label="Safe to spend card"]')
  await expect(safeToSpendCard).toBeVisible()

  await page.goto("/plan?tab=goals")
  await page.getByRole("button", { name: "Add Debt" }).first().click()
  const debtDialog = page.getByRole("dialog", { name: "Add Debt" })
  await expect(debtDialog).toBeVisible()
  await debtDialog.getByLabel("Debt name").fill(debtName)
  await debtDialog.getByLabel("Balance (KD)").fill("450.000")
  await debtDialog.getByLabel("Minimum / month (KD)").fill("25.000")
  await debtDialog.getByLabel("Due day (1-31)").fill("15")
  await debtDialog.getByRole("button", { name: "Add Debt" }).click()
  await expect(page.getByText("Debt account added.")).toBeVisible()
  await expect(page.getByText(debtName)).toBeVisible()

  await page.goto("/")
  await expect(safeToSpendCard).toContainText("Debt minimums")
  await expect(safeToSpendCard).toContainText("KD 25")
})

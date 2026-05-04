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

test("user can add, edit, and delete a transaction from Activity page", async ({ page }) => {
  const stamp = Date.now()
  const email = `tx-flow-${stamp}@example.com`
  const category = `Food ${stamp}`
  const originalName = `E2E Coffee ${stamp}`
  const updatedName = `E2E Coffee Updated ${stamp}`

  await registerAndStart(page, email)

  await page.getByRole("link", { name: "Transactions" }).first().click()
  await expect(page).toHaveURL(/\/activity(\?type=all)?$/)

  await page.getByRole("button", { name: "Add Transaction" }).first().click()
  const addDialog = page.getByRole("dialog", { name: "Add Expense" })
  await expect(addDialog).toBeVisible()

  await addDialog.getByLabel("Merchant").fill("E2E Market")
  await addDialog.locator('input[placeholder="Item name"]:visible').first().fill(originalName)
  await addDialog.locator('input[placeholder="Category"]:visible').first().fill(category)
  await addDialog.locator('input[placeholder="0.000"]:visible').first().fill("2.500")
  await addDialog.getByRole("button", { name: "Add Expense" }).click()

  const createdEntry = page.locator("tr:visible, article:visible", { hasText: originalName }).first()
  await expect(createdEntry).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Edit" }).first().click()

  const editDialog = page.getByRole("dialog", { name: "Edit Transaction" })
  await expect(editDialog).toBeVisible()
  await editDialog.locator('input[placeholder="Item name"]:visible').first().fill(updatedName)
  await editDialog.getByRole("button", { name: "Save Changes" }).click()

  await expect(createdEntry).toBeVisible({ timeout: 10_000 })
  await page.getByRole("button", { name: "Edit" }).first().click()

  const editDialogForDelete = page.getByRole("dialog", { name: "Edit Transaction" })
  await expect(editDialogForDelete).toBeVisible()
  await expect(editDialogForDelete.locator('input[placeholder="Item name"]:visible').first()).toHaveValue(updatedName)
  await editDialogForDelete.getByRole("button", { name: "Delete", exact: true }).click()

  const confirmDialog = page.getByRole("dialog", { name: "Delete transaction?" })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole("button", { name: "Delete" }).click()

  await expect(page.getByText("Transaction deleted.")).toBeVisible()
  await page.waitForTimeout(7000)
  await expect(page.locator("tbody")).not.toContainText(updatedName)
})

import { expect, test, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

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

async function addExpenseTransaction(
  page: Page,
  {
    merchant,
    name,
    category,
    amount,
  }: {
    merchant: string
    name: string
    category: string
    amount: string
  }
) {
  await page.getByRole("button", { name: "Add Transaction" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Add Expense" })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel("Merchant").fill(merchant)
  await dialog.locator('input[placeholder="Item name"]:visible').first().fill(name)
  await dialog.locator('input[placeholder="Category"]:visible').first().fill(category)
  await dialog.locator('input[placeholder="0.000"]:visible').first().fill(amount)
  await dialog.getByRole("button", { name: "Add Expense" }).click()

  await expect(page.locator("tr:visible, article:visible", { hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  })
}

test("settings dialog manages categories, merchants, and memorized transactions", async ({ page }) => {
  const stamp = Date.now()
  const categoryName = `Desk Category ${stamp}`
  const merchantName = `Desk Merchant ${stamp}`
  const memorizedTitle = `Desk Memorized ${stamp}`
  const updatedMemorizedTitle = `${memorizedTitle} Updated`

  await registerAndStart(page, `settings-dialog-${stamp}@example.com`)

  await page.goto("/activity?type=all")
  await page.getByRole("button", { name: "Settings" }).click()

  const dialog = page.getByRole("dialog", { name: "Settings" })
  await expect(dialog).toBeVisible()

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

  await dialog.getByPlaceholder("Transaction title", { exact: true }).fill(memorizedTitle)
  await dialog.getByPlaceholder("Category", { exact: true }).fill(categoryName)
  await dialog.getByPlaceholder("Merchant", { exact: true }).fill(merchantName)
  await dialog.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText("Memorized transaction added.")).toBeVisible()
  await expect(dialog).toContainText(memorizedTitle)

  await dialog.getByRole("button", { name: "Edit" }).first().click()
  await dialog.locator(`input[value="${memorizedTitle}"]`).last().fill(updatedMemorizedTitle)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Memorized transaction updated.")).toBeVisible()
  await expect(dialog).toContainText(updatedMemorizedTitle)

  await dialog.getByRole("button", { name: "Delete" }).first().click()
  const confirmDialog = page.getByRole("dialog", { name: "Confirm Action" })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByText("Memorized transaction deleted.")).toBeVisible()
  await expect(dialog).not.toContainText(updatedMemorizedTitle)

  await dialog.getByRole("button", { name: "Close" }).click()
  await expect(dialog).not.toBeVisible()
})

test("import preview and bulk edit dialogs update activity data", async ({ page }) => {
  const stamp = Date.now()
  const importedName = `Imported Lunch ${stamp}`
  const importedNameUpdated = `${importedName} Updated`
  const importedMerchantUpdated = `Imported Cafe ${stamp}`
  const bulkCategory = `Bulk Food ${stamp}`
  const bulkMerchantOne = `Batch Merchant One ${stamp}`
  const bulkMerchantTwo = `Batch Merchant Two ${stamp}`
  const expenseOne = `Bulk One ${stamp}`
  const expenseTwo = `Bulk Two ${stamp}`

  await registerAndStart(page, `admin-dialog-${stamp}@example.com`)
  await page.goto("/activity?type=all")

  await page.getByRole("button", { name: "Import", exact: true }).click()
  const importDialog = page.getByRole("dialog", { name: "Import Transactions" })
  await expect(importDialog).toBeVisible()

  const csv = [
    "date,merchant,category,name,amount_kd,memo",
    `2026-03-08,Cafe Import,Food,${importedName},4.250,Imported by Playwright`,
  ].join("\n")

  await importDialog.locator('input[type="file"]').setInputFiles({
    name: `import-${stamp}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  })
  await importDialog.getByRole("button", { name: "Preview & Import" }).click()

  const previewDialog = page.getByRole("dialog", { name: "Preview Import" })
  await expect(previewDialog).toBeVisible()

  const previewNameInput = previewDialog.locator('input[placeholder="Item name"]:visible').first()
  const previewMerchantInput = previewDialog.locator('input[placeholder="Optional"]:visible').first()
  const approveButton = previewDialog.getByRole("button", { name: "Approve & Import" })

  await previewNameInput.fill("")
  await expect(approveButton).toBeDisabled()

  await previewNameInput.fill(importedNameUpdated)
  await previewMerchantInput.fill(importedMerchantUpdated)
  await expect(approveButton).toBeEnabled()
  await approveButton.click()

  const completeDialog = page.getByRole("dialog", { name: "Import Complete" })
  await expect(completeDialog).toBeVisible()
  await expect(completeDialog).toContainText("created")
  await expect(completeDialog).toContainText("1")
  await completeDialog.getByRole("button", { name: "Done" }).click()

  await expect(page.locator("main")).toContainText(importedNameUpdated)

  await addExpenseTransaction(page, {
    merchant: "Cafe Alpha",
    name: expenseOne,
    category: bulkCategory,
    amount: "2.250",
  })
  await addExpenseTransaction(page, {
    merchant: "Cafe Beta",
    name: expenseTwo,
    category: bulkCategory,
    amount: "3.750",
  })

  await page.getByRole("checkbox", { name: `Select transaction ${expenseOne}` }).check()
  await page.getByRole("checkbox", { name: `Select transaction ${expenseTwo}` }).check()

  const bulkBar = page.locator("div.sticky", { hasText: "2 selected" }).first()
  await expect(bulkBar).toBeVisible()
  await bulkBar.getByRole("button", { name: "Edit" }).first().click()

  const bulkDialog = page.getByRole("dialog", { name: "Edit 2 transactions" })
  await expect(bulkDialog).toBeVisible()

  const bulkTableInputs = bulkDialog.locator("table input")
  await bulkTableInputs.nth(1).fill(bulkMerchantOne)
  await bulkTableInputs.nth(3).fill(bulkMerchantTwo)

  await bulkDialog.getByRole("button", { name: "Save All" }).click()
  await expect(bulkDialog).not.toBeVisible({ timeout: 10_000 })
  await expect(bulkBar).not.toBeVisible({ timeout: 10_000 })
  await expect(page.locator("main")).toContainText(bulkMerchantOne)
  await expect(page.locator("main")).toContainText(bulkMerchantTwo)
  await expect(page.locator("main")).toContainText(expenseOne)
  await expect(page.locator("main")).toContainText(expenseTwo)
})

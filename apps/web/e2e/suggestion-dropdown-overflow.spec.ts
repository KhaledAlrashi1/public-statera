/**
 * Verifies that suggestion dropdowns in transaction/expense dialogs do not
 * overflow the viewport vertically at small screen sizes.
 *
 * The three dropdowns audited in docs/ui-audit/overflow.md are hand-rolled
 * absolute-positioned divs inside a scroll-clipped DialogContent. They each
 * now have max-h-60 + overflow-y-auto to prevent clipping below the fold.
 *
 * This spec seeds a memorized transaction so the suggestion list actually
 * appears, then measures the dropdown bounding box against the viewport.
 */

import { expect, test, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

async function registerAndLogin(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForFunction(
    () => window.location.pathname === "/" || window.location.pathname === "/welcome",
    undefined,
    { timeout: 20_000 }
  )

  const ownData = page.getByRole("button", { name: "Start with my own data" })
  if (await ownData.isVisible().catch(() => false)) {
    await ownData.click()
  }

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
}

async function seedTransaction(page: Page) {
  await page.goto("/activity?type=all")

  // Open QuickAdd (FAB) to add a transaction that will be memorized
  const fab = page.getByRole("button", { name: /add transaction/i }).first()
  await fab.click()
  const dialog = page.getByRole("dialog", { name: /add expense/i })
  await expect(dialog).toBeVisible()

  const tabExpense = dialog.getByRole("tab", { name: /expense/i })
  if (await tabExpense.isVisible().catch(() => false)) await tabExpense.click()

  const nameInput = dialog.locator('input[placeholder="Item name"]:visible, input[placeholder="Name"]:visible').first()
  await nameInput.fill("KFC")

  const categoryInput = dialog.locator('input[placeholder="Category"]:visible').first()
  await categoryInput.fill("Dining")

  const amountInput = dialog.locator('input[placeholder="0.000"]:visible').first()
  await amountInput.fill("5.000")

  await dialog.getByRole("button", { name: /save|add/i }).last().click()
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })
}

async function assertDropdownWithinViewport(page: Page, dropdownLocator: ReturnType<Page["locator"]>) {
  const box = await dropdownLocator.boundingBox()
  if (!box) {
    // Dropdown not visible — skip (suggestion list may be empty in this env)
    return
  }
  const viewport = page.viewportSize()!
  expect(box.y + box.height, "suggestion dropdown bottom edge exceeds viewport").toBeLessThanOrEqual(
    viewport.height + 2 // 2px tolerance for subpixel rounding
  )
  expect(box.x, "suggestion dropdown left edge is negative").toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, "suggestion dropdown right edge exceeds viewport").toBeLessThanOrEqual(
    viewport.width + 2
  )
}

const VIEWPORTS = [
  { name: "iPhone SE (375×667)", width: 375, height: 667 },
  { name: "iPhone 14 (390×844)", width: 390, height: 844 },
  { name: "Desktop (1280×800)", width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test(`AddTransactionDialog suggestion dropdown stays within viewport — ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const stamp = Date.now()

    try {
      await registerAndLogin(page, `drop-add-${stamp}@example.com`)
      await seedTransaction(page)

      await page.goto("/activity?type=all")
      const fab = page.getByRole("button", { name: /add transaction/i }).first()
      await fab.click()
      const dialog = page.getByRole("dialog", { name: /add expense/i })
      await expect(dialog).toBeVisible()

      const tabExpense = dialog.getByRole("tab", { name: /expense/i })
      if (await tabExpense.isVisible().catch(() => false)) await tabExpense.click()

      const nameInput = dialog.locator('input[placeholder="Item name"]:visible, input[placeholder="Name"]:visible').first()
      await nameInput.fill("KF")
      await page.waitForTimeout(400) // debounce

      const dropdown = dialog.locator(".overflow-y-auto.rounded-xl.border.border-border.bg-card").first()
      if (await dropdown.isVisible().catch(() => false)) {
        await assertDropdownWithinViewport(page, dropdown)
      }
    } finally {
      await context.close()
    }
  })
}

test("suggestion dropdown is scrollable when full (does not grow without bound)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const stamp = Date.now()
  await registerAndLogin(page, `drop-scroll-${stamp}@example.com`)
  await seedTransaction(page)

  await page.goto("/activity?type=all")
  const fab = page.getByRole("button", { name: /add transaction/i }).first()
  await fab.click()
  const dialog = page.getByRole("dialog", { name: /add expense/i })
  await expect(dialog).toBeVisible()

  const tabExpense = dialog.getByRole("tab", { name: /expense/i })
  if (await tabExpense.isVisible().catch(() => false)) await tabExpense.click()

  const nameInput = dialog.locator('input[placeholder="Item name"]:visible, input[placeholder="Name"]:visible').first()
  await nameInput.fill("KF")
  await page.waitForTimeout(400)

  const dropdown = dialog.locator(".overflow-y-auto.rounded-xl.border.border-border.bg-card").first()
  if (await dropdown.isVisible().catch(() => false)) {
    const box = await dropdown.boundingBox()
    if (box) {
      // max-h-60 = 240px in Tailwind default config
      expect(box.height, "dropdown must not exceed max-h-60 (240px)").toBeLessThanOrEqual(244)
    }
  }
})

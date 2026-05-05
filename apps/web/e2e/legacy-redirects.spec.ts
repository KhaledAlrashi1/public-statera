import { expect, test } from "@playwright/test"

test.skip(
  process.env.VITE_ENABLE_PHASE2_LEGACY_REDIRECTS !== "true",
  "Requires VITE_ENABLE_PHASE2_LEGACY_REDIRECTS=true"
)

test("legacy routes redirect to phase-2 shells", async ({ page }) => {
  const stamp = Date.now()
  const email = `legacy-redirect-${stamp}@example.com`

  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
  await page.getByRole("textbox", { name: /^Confirm password$/ }).fill("Password123!")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/transactions")
  await expect(page).toHaveURL(/\/activity\?type=all$/)
  await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true")

  await page.goto("/expenses")
  await expect(page).toHaveURL(/\/activity\?type=expense$/)
  await expect(page.getByRole("tab", { name: "Expenses" })).toHaveAttribute("aria-selected", "true")

  await page.goto("/income")
  await expect(page).toHaveURL(/\/activity\?type=income$/)
  await expect(page.getByRole("tab", { name: "Income" })).toHaveAttribute("aria-selected", "true")

  await page.goto("/budget")
  await expect(page).toHaveURL(/\/plan$/)
})

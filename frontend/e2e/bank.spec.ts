import { expect, test } from "@playwright/test"

test.describe("Open Banking is hidden", () => {
  test("bank route is not available from the frontend", async ({ page }) => {
    const stamp = Date.now()
    const email = `bank-hidden-${stamp}@example.com`

    await page.goto("/register")
    await page.getByPlaceholder("you@example.com").fill(email)
    await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
    await page.getByRole("textbox", { name: /^Confirm password$/ }).fill("Password123!")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/welcome$/)

    await page.goto("/bank")
    await expect(page.getByText(/page not found/i)).toBeVisible()
  })
})

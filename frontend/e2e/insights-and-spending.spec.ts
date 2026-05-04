import { expect, test } from "@playwright/test"

async function registerAndLogin(page: any, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
  await page.getByRole("textbox", { name: /^Confirm password$/ }).fill("Password123!")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
}

test("insights page renders with correct badge and nav link is active", async ({ page }) => {
  const stamp = Date.now()
  await registerAndLogin(page, `insights-e2e-${stamp}@example.com`)

  await page.goto("/insights")
  await expect(page).toHaveURL(/\/insights$/)
  await expect(page.getByText("Insights")).toBeVisible()
})

test("spending-intelligence page renders with correct badge", async ({ page }) => {
  const stamp = Date.now()
  await registerAndLogin(page, `spending-e2e-${stamp}@example.com`)

  await page.goto("/spending-intelligence")
  await expect(page).toHaveURL(/\/spending-intelligence$/)
  await expect(page.getByText("Spending Intelligence")).toBeVisible()
})

test("/spending redirects to /spending-intelligence", async ({ page }) => {
  const stamp = Date.now()
  await registerAndLogin(page, `spending-redirect-e2e-${stamp}@example.com`)

  await page.goto("/spending")
  await expect(page).toHaveURL(/\/spending-intelligence$/)
})

test("insights and spending-intelligence appear in the nav", async ({ page }) => {
  const stamp = Date.now()
  await registerAndLogin(page, `nav-links-e2e-${stamp}@example.com`)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")

  await page.getByRole("link", { name: "Insights" }).click()
  await expect(page).toHaveURL(/\/insights$/)

  await page.getByRole("link", { name: "Trends" }).click()
  await expect(page).toHaveURL(/\/spending-intelligence$/)
})

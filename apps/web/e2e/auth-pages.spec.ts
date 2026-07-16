import { expect, test } from "@playwright/test"

test("login page renders and links to register + forgot password", async ({ page }) => {
  await page.goto("/login")

  await expect(page.getByRole("heading", { name: "Access your account" })).toBeVisible()
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()

  await page.getByRole("link", { name: "Create one" }).click()
  await expect(page).toHaveURL(/\/register$/)

  await page.goto("/login")
  await page.getByRole("link", { name: "Forgot your password?" }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
})

test("forgot-password page renders and links back to login", async ({ page }) => {
  await page.goto("/forgot-password")

  await expect(page.getByRole("heading", { name: "Forgot Password" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible()

  await page.getByRole("link", { name: "Back to Login" }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test("register page validates mismatched passwords on client", async ({ page }) => {
  await page.goto("/register")

  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible()
  await page.getByPlaceholder("you@example.com").fill("newuser@example.com")
  await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
  await page.getByRole("textbox", { name: /^Confirm password$/ }).fill("Different123!")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Passwords do not match")).toBeVisible()
  await page.getByRole("link", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test("newly registered user can continue from workspace choice to the dashboard", async ({ page }) => {
  const email = `dashboard-${Date.now()}@example.com`
  await page.goto("/register")

  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill("Password123!")
  await page.getByRole("textbox", { name: /^Confirm password$/ }).fill("Password123!")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole("heading", { name: /Choose your starting point/i })).toBeVisible()
  await page.getByRole("button", { name: "Start with my own data" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("region", { name: "Income vs Expenses chart" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Expenses by category" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Top expense categories" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Activation steps" })).toHaveCount(0)
})

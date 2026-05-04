import { expect, test, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

type AxeViolation = {
  id: string
  impact?: string | null
  description?: string
  nodes?: Array<{ target?: string[] }>
}

function isMissingAxeModule(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module/.test(message)
}

async function runAxe(page: Page) {
  try {
    const { default: AxeBuilder } = await import("@axe-core/playwright")
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    const violationSummary = (results.violations as AxeViolation[])
      .map((violation) => {
        const targets = (violation.nodes || [])
          .flatMap((node) => node.target || [])
          .slice(0, 3)
          .join(", ")
        return `${violation.id} (${violation.impact || "unknown"}): ${targets || violation.description || "no target"}`
      })
      .join("\n")

    expect(results.violations, violationSummary || "No accessibility violations").toEqual([])
    return
  } catch (error) {
    if (!isMissingAxeModule(error)) throw error
  }

  try {
    const { checkA11y, injectAxe } = await import("axe-playwright")
    await injectAxe(page)
    await checkA11y(page, undefined, {
      axeOptions: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa"],
        },
      },
    })
    return
  } catch (error) {
    if (!isMissingAxeModule(error)) throw error
  }

  test.skip(true, "Install @axe-core/playwright or axe-playwright to run accessibility checks.")
}

async function login(page: Page, email: string) {
  await page.goto("/login")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function register(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
}

async function ensureAuthenticated(page: Page, email: string) {
  await login(page, email)
  try {
    await expect(page).toHaveURL(/\/$/, { timeout: 4_000 })
    return
  } catch {
    // Account likely does not exist yet.
  }

  await register(page, email)
  try {
    await expect(page).toHaveURL(/\/$/, { timeout: 8_000 })
    return
  } catch {
    // Retry login when the account already exists.
  }

  await login(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 8_000 })
}

async function gotoAndScan(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).toBeVisible()
  await runAxe(page)
}

test.describe("accessibility smoke checks", () => {
  test("Login page has no WCAG A/AA axe violations", async ({ page }) => {
    await gotoAndScan(page, "/login")
  })

  test("Register page has no WCAG A/AA axe violations", async ({ page }) => {
    await gotoAndScan(page, "/register")
  })

  test("Dashboard page has no WCAG A/AA axe violations", async ({ page }) => {
    await ensureAuthenticated(page, `a11y-dashboard-${Date.now()}@example.com`)
    await gotoAndScan(page, "/")
  })

  test("Transactions page has no WCAG A/AA axe violations", async ({ page }) => {
    await ensureAuthenticated(page, `a11y-transactions-${Date.now()}@example.com`)
    await gotoAndScan(page, "/activity?type=all")
  })

  test("Budget page has no WCAG A/AA axe violations", async ({ page }) => {
    await ensureAuthenticated(page, `a11y-budget-${Date.now()}@example.com`)
    await gotoAndScan(page, "/plan")
  })

  test("Profile page has no WCAG A/AA axe violations", async ({ page }) => {
    await ensureAuthenticated(page, `a11y-profile-${Date.now()}@example.com`)
    await gotoAndScan(page, "/profile")
  })
})

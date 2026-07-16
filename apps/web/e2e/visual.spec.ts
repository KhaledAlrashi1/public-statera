import { devices, expect, test, type Browser, type Page } from "@playwright/test"

const PASSWORD = "Password123!"
const THEME_KEY = "theme"

const APP_ROUTES: Array<{ key: string; path: string }> = [
  { key: "dashboard", path: "/" },
  { key: "activity", path: "/activity?type=all" },
  { key: "activity-expense", path: "/activity?type=expense" },
  { key: "activity-income", path: "/activity?type=income" },
  { key: "budget", path: "/plan" },
  { key: "budget-goals", path: "/plan?tab=goals" },
  { key: "insights", path: "/insights" },
  { key: "profile", path: "/profile" },
]

const MOBILE_APP_ROUTES: Array<{ key: string; path: string }> = [
  { key: "mobile-dashboard", path: "/" },
  { key: "mobile-activity", path: "/activity?type=all" },
  { key: "mobile-budget-goals", path: "/plan?tab=goals" },
  { key: "mobile-insights", path: "/insights" },
  { key: "mobile-profile", path: "/profile" },
]

async function setTheme(page: Page, mode: "light" | "dark") {
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
    document.documentElement.classList.toggle("dark", value === "dark")
  }, [THEME_KEY, mode] as const)
  await page.waitForTimeout(100)
}

async function captureRoute(page: Page, key: string, path: string, mode: "light" | "dark") {
  await page.goto(path)
  await setTheme(page, mode)
  await page.waitForTimeout(950)

  const masks = []
  masks.push(page.getByRole("button", { name: "Open profile" }))
  if (key.includes("dashboard")) {
    masks.push(page.getByText(/Updated \d{1,2}:\d{2}/))
  }
  if (key.includes("profile")) {
    masks.push(page.locator("section", {
      has: page.getByRole("heading", { name: "Recent Security Activity" }),
    }))
  }

  await expect(page).toHaveScreenshot(`route-${key}-${mode}.png`, {
    animations: "disabled",
    fullPage: false,
    mask: masks,
    maxDiffPixels: 2500,
  })
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

async function resolveWorkspaceChoice(page: Page) {
  const emptyButton = page.getByRole("button", { name: "Start with my own data" })
  const demoButton = page.getByRole("button", { name: "Load demo workspace" })

  await page.waitForTimeout(250)
  const emptyVisible = await emptyButton.isVisible().catch(() => false)
  const demoVisible = await demoButton.isVisible().catch(() => false)

  if (!emptyVisible && !demoVisible) {
    return
  }

  await emptyButton.click()
}

async function settleAuthenticatedRoute(page: Page) {
  await page.waitForFunction(() => {
    return ["/", "/welcome"].includes(window.location.pathname)
  }, undefined, { timeout: 20_000 })

  await resolveWorkspaceChoice(page)
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  await page.waitForLoadState("networkidle")
}

async function ensureAuthenticated(page: Page, email: string) {
  await register(page, email)
  try {
    await settleAuthenticatedRoute(page)
    return
  } catch {
    // retry with login if the account already exists or registration failed to settle
  }

  await login(page, email)
  await settleAuthenticatedRoute(page)
}

async function createMobileContext(browser: Browser) {
  return browser.newContext({ ...devices["iPhone 13"] })
}

test.describe("visual regression", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(120_000)

  test("app shell pages light", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await ensureAuthenticated(page, `visual-theme-light-${Date.now()}@example.com`)

    for (const route of APP_ROUTES) {
      await captureRoute(page, route.key, route.path, "light")
    }
  })

  test("app shell pages dark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await ensureAuthenticated(page, `visual-theme-dark-${Date.now()}@example.com`)

    for (const route of APP_ROUTES) {
      await captureRoute(page, route.key, route.path, "dark")
    }
  })

  test("app shell pages mobile light", async ({ browser }) => {
    const context = await createMobileContext(browser)
    const page = await context.newPage()

    try {
      await ensureAuthenticated(page, `visual-mobile-light-${Date.now()}@example.com`)

      for (const route of MOBILE_APP_ROUTES) {
        await captureRoute(page, route.key, route.path, "light")
      }
    } finally {
      await context.close()
    }
  })

  test("ProfilePage dark mode — no white boxes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await ensureAuthenticated(page, `visual-profile-${Date.now()}@example.com`)

    await page.goto("/profile")
    await setTheme(page, "dark")

    const recentSecuritySection = page.locator("section", {
      has: page.getByRole("heading", { name: "Recent Security Activity" }),
    })
    const profileButton = page.getByRole("button", { name: "Open profile" })

    await expect(page).toHaveScreenshot("profile-dark.png", {
      animations: "disabled",
      fullPage: false,
      mask: [recentSecuritySection, profileButton],
      maxDiffPixels: 2500,
    })
  })

  test("Add transaction dialog dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await ensureAuthenticated(page, `visual-activity-${Date.now()}@example.com`)

    await page.goto("/activity")
    await setTheme(page, "dark")

    const addDialog = page.getByRole("dialog", {
      name: /Add (Transaction|Expense|Income)/i,
    })

    await page.keyboard.press("n")
    try {
      await expect(addDialog).toBeVisible({ timeout: 1_500 })
    } catch {
      await page
        .getByRole("button", { name: /Add (Transaction|Expense|Income)/i })
        .first()
        .click()
      await expect(addDialog).toBeVisible({ timeout: 4_000 })
    }

    const dateInput = addDialog.getByLabel("Date")
    if (await dateInput.count()) {
      await dateInput.fill("2026-01-15")
    }

    const profileButton = page.getByRole("button", { name: "Open profile" })
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot("add-transaction-dialog-dark.png", {
      animations: "disabled",
      fullPage: true,
      mask: [profileButton],
    })
  })
})

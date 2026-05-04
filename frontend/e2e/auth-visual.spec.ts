import { expect, test, type Page } from "@playwright/test"

const PASSWORD = "Password123!"
const THEME_KEY = "theme"

const PUBLIC_ROUTES: Array<{ key: string; path: string; heading: string }> = [
  { key: "login", path: "/login", heading: "Access your account" },
  { key: "register", path: "/register", heading: "Create your account" },
  { key: "forgot-password", path: "/forgot-password", heading: "Forgot Password" },
]

async function setTheme(page: Page, mode: "light" | "dark") {
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
    document.documentElement.classList.toggle("dark", value === "dark")
  }, [THEME_KEY, mode] as const)
  await page.waitForTimeout(100)
}

async function capturePublicRoute(page: Page, route: (typeof PUBLIC_ROUTES)[number], mode: "light" | "dark") {
  await page.goto(route.path)
  await expect(page.getByRole("heading", { name: route.heading })).toBeVisible()
  await setTheme(page, mode)
  await page.waitForTimeout(250)

  await expect(page).toHaveScreenshot(`auth-${route.key}-${mode}.png`, {
    animations: "disabled",
    fullPage: true,
    maxDiffPixels: 2500,
  })
}

async function registerForWelcome(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/welcome$/, { timeout: 20_000 })
  await expect(page.getByRole("heading", { name: /Choose your starting point/i })).toBeVisible()
}

test.describe("auth visual regression", () => {
  test.describe.configure({ mode: "serial" })

  test("public auth pages light", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 })

    for (const route of PUBLIC_ROUTES) {
      await capturePublicRoute(page, route, "light")
    }
  })

  test("public auth pages dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 })

    for (const route of PUBLIC_ROUTES) {
      await capturePublicRoute(page, route, "dark")
    }
  })

  test("workspace choice light", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 })
    await registerForWelcome(page, `auth-visual-light-${Date.now()}@example.com`)
    await setTheme(page, "light")
    await page.waitForTimeout(250)

    await expect(page).toHaveScreenshot("auth-welcome-light.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: 2500,
    })
  })

  test("workspace choice dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 })
    await registerForWelcome(page, `auth-visual-dark-${Date.now()}@example.com`)
    await setTheme(page, "dark")
    await page.waitForTimeout(250)

    await expect(page).toHaveScreenshot("auth-welcome-dark.png", {
      animations: "disabled",
      fullPage: true,
      maxDiffPixels: 2500,
    })
  })
})

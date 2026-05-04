import { devices, expect, test, type Browser, type Page } from "@playwright/test"

const PASSWORD = "Password123!"

type ClientErrors = {
  consoleErrors: string[]
  pageErrors: string[]
}

const AUTH_ROUTES: Array<{
  label: string
  path: string
  heading: string
  exercise?: (page: Page) => Promise<void>
}> = [
  {
    label: "login",
    path: "/login",
    heading: "Access your account",
  },
  {
    label: "register",
    path: "/register",
    heading: "Create your account",
  },
  {
    label: "forgot-password",
    path: "/forgot-password",
    heading: "Forgot Password",
  },
  {
    label: "reset-password",
    path: "/reset-password",
    heading: "Reset Password",
    exercise: async (page) => {
      await page.getByRole("button", { name: "Save Password" }).click()
      await expect(page.getByText("This reset link is incomplete or has expired.")).toBeVisible()
    },
  },
  {
    label: "confirm-email-change",
    path: "/security/email-change",
    heading: "Confirm Email Change",
    exercise: async (page) => {
      await page.getByRole("button", { name: "Confirm" }).click()
      await expect(page.getByText("This confirmation link is incomplete or has expired.")).toBeVisible()
    },
  },
  {
    label: "confirm-password-change",
    path: "/security/password-change",
    heading: "Set New Password",
    exercise: async (page) => {
      await page.getByRole("button", { name: "Save Password" }).click()
      await expect(page.getByText("This password change link is incomplete or has expired.")).toBeVisible()
    },
  },
]

function attachClientErrorCapture(page: Page): ClientErrors {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text())
    }
  })

  page.on("pageerror", (error) => {
    pageErrors.push(error.message)
  })

  return { consoleErrors, pageErrors }
}

async function assertNoClientErrors(errors: ClientErrors) {
  expect(errors.pageErrors, "Unexpected uncaught page errors").toEqual([])
  expect(errors.consoleErrors, "Unexpected console errors").toEqual([])
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))

  expect(
    Math.max(metrics.doc, metrics.body),
    `${label} overflowed horizontally (viewport ${metrics.viewport}, doc ${metrics.doc}, body ${metrics.body})`
  ).toBeLessThanOrEqual(metrics.viewport + 4)
}

async function visitAuthRoute(page: Page, route: (typeof AUTH_ROUTES)[number]) {
  await page.goto(route.path)
  await expect(page.getByRole("heading", { name: route.heading })).toBeVisible()
  await route.exercise?.(page)
  await expectNoHorizontalOverflow(page, route.label)
}

async function registerAndStayOnWelcome(page: Page, email: string) {
  await page.goto("/register")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByRole("textbox", { name: /^Password$/ }).fill(PASSWORD)
  await page.getByRole("textbox", { name: /^Confirm password$/i }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/welcome$/, { timeout: 20_000 })
  await expect(page.getByRole("heading", { name: new RegExp("Choose your starting point", "i") })).toBeVisible()
}

async function createMobileContext(browser: Browser) {
  return browser.newContext({ ...devices["iPhone 13"] })
}

test("standalone auth routes stay stable on desktop", async ({ page }) => {
  const errors = attachClientErrorCapture(page)

  await page.setViewportSize({ width: 1280, height: 900 })
  for (const route of AUTH_ROUTES) {
    await visitAuthRoute(page, route)
  }

  await assertNoClientErrors(errors)
})

test("standalone auth routes stay stable on mobile", async ({ browser }) => {
  const context = await createMobileContext(browser)
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)

  try {
    for (const route of AUTH_ROUTES) {
      await visitAuthRoute(page, route)
    }

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

test("workspace choice and expanded profile sections fit on mobile", async ({ browser }) => {
  const context = await createMobileContext(browser)
  const page = await context.newPage()
  const errors = attachClientErrorCapture(page)

  try {
    const stamp = Date.now()
    await registerAndStayOnWelcome(page, `auth-profile-qa-${stamp}@example.com`)
    await expectNoHorizontalOverflow(page, "welcome")

    await page.getByRole("button", { name: "Start with my own data" }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })

    await page.goto("/profile")
    await expect(page.getByRole("heading", { name: "Account, security, and preferences" })).toBeVisible()
    await expectNoHorizontalOverflow(page, "profile")

    await page.getByRole("button", { name: "Change", exact: true }).click()
    await expect(page.getByLabel("New email address")).toBeVisible()
    await expectNoHorizontalOverflow(page, "profile email change")

    await page.getByRole("button", { name: "Delete my account" }).click()
    await expect(page.getByLabel("Type your email to confirm")).toBeVisible()
    await expectNoHorizontalOverflow(page, "profile danger zone")

    await assertNoClientErrors(errors)
  } finally {
    await context.close()
  }
})

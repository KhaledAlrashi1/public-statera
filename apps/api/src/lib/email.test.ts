import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sendEmail, sendEmailBackground } from "./email"

// Point writes at a temp file so tests never touch the real logs/ directory.
const TEST_LOG = join(tmpdir(), `statera_email_test_${process.pid}.log`)

beforeEach(() => {
  process.env["EMAIL_DEV_LOG_PATH"] = TEST_LOG
  if (existsSync(TEST_LOG)) rmSync(TEST_LOG)
})

afterEach(() => {
  delete process.env["EMAIL_DEV_LOG_PATH"]
  if (existsSync(TEST_LOG)) rmSync(TEST_LOG)
})

describe("sendEmail (dev mode)", () => {
  it("writes a JSON log entry and returns true", async () => {
    const ok = await sendEmail(
      "user@example.com",
      "Hello there",
      "<p>Hi</p>",
      "Hi",
    )
    expect(ok).toBe(true)
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
    expect(entry.to).toBe("user@example.com")
    expect(entry.subject).toBe("Hello there")
    expect(entry.html_body).toBe("<p>Hi</p>")
    expect(entry.text_body).toBe("Hi")
    expect(typeof entry.ts).toBe("string")
  })

  it("appends multiple entries on repeated calls", async () => {
    await sendEmail("a@example.com", "First", "", "")
    await sendEmail("b@example.com", "Second", "", "")
    const lines = readFileSync(TEST_LOG, "utf8").trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).to).toBe("a@example.com")
    expect(JSON.parse(lines[1]).to).toBe("b@example.com")
  })

  it("truncates subject to 255 characters", async () => {
    await sendEmail("u@example.com", "X".repeat(300), "", "")
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
    expect(entry.subject.length).toBe(255)
  })
})

describe("sendEmail validation", () => {
  it("returns false and skips write when recipient is empty", async () => {
    const ok = await sendEmail("", "Subject", "<p></p>", "")
    expect(ok).toBe(false)
    expect(existsSync(TEST_LOG)).toBe(false)
  })

  it("returns false and skips write when subject is empty", async () => {
    const ok = await sendEmail("u@example.com", "  ", "<p></p>", "")
    expect(ok).toBe(false)
    expect(existsSync(TEST_LOG)).toBe(false)
  })

  it("trims whitespace from recipient before using it", async () => {
    await sendEmail("  spaced@example.com  ", "Hi", "", "")
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
    expect(entry.to).toBe("spaced@example.com")
  })
})

describe("sendEmailBackground", () => {
  it("fires without blocking and the log entry appears asynchronously", async () => {
    sendEmailBackground("bg@example.com", "Bg subject", "<p>bg</p>", "bg")
    // Give the event loop one tick to flush the promise.
    await new Promise((r) => setTimeout(r, 10))
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
    expect(entry.to).toBe("bg@example.com")
  })
})

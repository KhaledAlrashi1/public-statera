/**
 * Unit tests for handleGenerateActivationReport.
 *
 * Mocks buildActivationReport and fs.promises so the handler can be tested
 * without Redis, MySQL, or the filesystem.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../../lib/activation-reporting-lib", () => ({
  buildActivationReport: vi.fn(),
}))
vi.mock("../../lib/env", () => ({
  env: {
    activationReportDays: 30,
    activationReportPath: "reports/activation-report.latest.json",
    activationReportIntervalHours: 1,
  },
}))
vi.mock("../task-runs", () => ({
  markWorkerTaskStarted: vi.fn().mockResolvedValue(undefined),
  markWorkerTaskFinished: vi.fn().mockResolvedValue(undefined),
}))
const mockDb = {}
vi.mock("../../db/connection", () => ({ getDb: vi.fn(() => mockDb) }))

// Mock node:fs/promises so no real file writes happen.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports under test ────────────────────────────────────────────────────────

import {
  handleGenerateActivationReport,
  TASK_GENERATE_ACTIVATION_REPORT,
} from "./activation-report-job"
import { buildActivationReport } from "../../lib/activation-reporting-lib"
import { markWorkerTaskStarted, markWorkerTaskFinished } from "../task-runs"
import { Sentry } from "../../lib/sentry"
import * as fsPromises from "node:fs/promises"

const fakeJob = {} as Job

const fakeReport = {
  activation_paths: { demo_data_loaded: 0, demo_replaced_with_import: 0, import_completed: 0 },
  daily: [],
  summary: {
    activated_any: 0,
    activation_rate_from_signup_pct: null,
    app_opened: 0,
    budget_rate_from_signup_pct: null,
    demo_to_import_users: 0,
    first_budget_set: 0,
    median_hours_signup_to_activation: null,
    signup_completed: 0,
    users_created: 0,
  },
  window: {
    as_of: "2026-05-13T12:00:00+00:00",
    days: 30,
    end_exclusive: "2026-05-14T00:00:00+00:00",
    start: "2026-04-13T00:00:00+00:00",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buildActivationReport).mockResolvedValue(fakeReport)
})

// ── Success path ──────────────────────────────────────────────────────────────

describe("handleGenerateActivationReport — success path", () => {
  it("calls markWorkerTaskStarted and markWorkerTaskFinished(success)", async () => {
    await handleGenerateActivationReport(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_GENERATE_ACTIVATION_REPORT)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_GENERATE_ACTIVATION_REPORT,
      "success",
      undefined,
    )
  })

  it("calls buildActivationReport with configured days", async () => {
    await handleGenerateActivationReport(fakeJob)
    expect(buildActivationReport).toHaveBeenCalledWith(30, expect.anything())
  })

  it("writes to a tmp file then renames to the output path", async () => {
    await handleGenerateActivationReport(fakeJob)
    expect(fsPromises.writeFile).toHaveBeenCalledOnce()
    const [tmpPath, content] = vi.mocked(fsPromises.writeFile).mock.calls[0]!
    expect(String(tmpPath)).toContain(".tmp-")
    expect(String(content)).toContain('"days": 30')
    expect(fsPromises.rename).toHaveBeenCalledOnce()
    const [src, dest] = vi.mocked(fsPromises.rename).mock.calls[0]!
    expect(src).toBe(tmpPath)
    expect(String(dest)).toContain("activation-report.latest.json")
  })

  it("creates the output directory before writing", async () => {
    await handleGenerateActivationReport(fakeJob)
    expect(fsPromises.mkdir).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    )
  })
})

// ── Error path ────────────────────────────────────────────────────────────────

describe("handleGenerateActivationReport — error path", () => {
  it("marks task as failure and reports to Sentry when buildActivationReport throws", async () => {
    vi.mocked(buildActivationReport).mockRejectedValueOnce(new Error("DB down"))
    await handleGenerateActivationReport(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_GENERATE_ACTIVATION_REPORT,
      "failure",
      "DB down",
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })

  it("marks task as failure when fs.rename throws", async () => {
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(new Error("rename failed"))
    await handleGenerateActivationReport(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_GENERATE_ACTIVATION_REPORT,
      "failure",
      "rename failed",
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

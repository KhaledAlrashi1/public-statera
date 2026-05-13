import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import type { Job } from "bullmq"
import { getDb } from "../../db/connection"
import { env } from "../../lib/env"
import { Sentry } from "../../lib/sentry"
import { buildActivationReport } from "../../lib/activation-reporting-lib"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "../task-runs"

export const TASK_GENERATE_ACTIVATION_REPORT = "generate-activation-report"

export async function handleGenerateActivationReport(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_GENERATE_ACTIVATION_REPORT)

  try {
    const db = getDb()
    const report = await buildActivationReport(env.activationReportDays, db)
    const json = JSON.stringify(report, null, 2)

    const outPath = path.resolve(env.activationReportPath)
    await fs.mkdir(path.dirname(outPath), { recursive: true })

    // Atomic write: tmp file on same filesystem → rename (POSIX rename is atomic).
    const tmpPath = path.join(
      path.dirname(outPath),
      `.tmp-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`,
    )
    await fs.writeFile(tmpPath, json, "utf8")
    await fs.rename(tmpPath, outPath)

    await markWorkerTaskFinished(TASK_GENERATE_ACTIVATION_REPORT, "success", undefined)
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: TASK_GENERATE_ACTIVATION_REPORT } })
    const message = err instanceof Error ? err.message : String(err)
    await markWorkerTaskFinished(TASK_GENERATE_ACTIVATION_REPORT, "failure", message)
  }
}

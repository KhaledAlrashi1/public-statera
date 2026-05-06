// Transactional email delivery — Postmark in production, JSON log in development.
//
// sendTemplatedEmail is intentionally NOT implemented here. It will be added when
// the first templated-email caller is migrated (module 3a — budget alerts).
// When implementing it:
//   - Implement template rendering in a separate module (email-templates.ts) to
//     keep the delivery layer independent of the presentation layer.
//   - MUST preserve this validation before loading any template:
//       reject names containing "..", "/", or "\\" to prevent path traversal.
//   - Choose the templating library at that point with the actual templates in
//     hand (mustache is a reasonable starting point for logic-less templates).

import { appendFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import * as postmark from "postmark"
import { env } from "./env"
import { Sentry } from "./sentry"

function devLogPath(): string {
  const configured = (process.env["EMAIL_DEV_LOG_PATH"] ?? "").trim()
  return configured || join("logs", "email_dev.log")
}

async function writeDevLog(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): Promise<void> {
  const logPath = devLogPath()
  await mkdir(dirname(resolve(logPath)), { recursive: true })
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      to,
      subject,
      html_body: htmlBody,
      text_body: textBody,
    }) + "\n"
  await appendFile(logPath, line, "utf8")
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): Promise<boolean> {
  const recipient = to.trim()
  if (!recipient) {
    console.warn("[email] Skipping send: missing recipient")
    return false
  }

  const mailSubject = subject.trim().slice(0, 255)
  if (!mailSubject) {
    console.warn("[email] Skipping send: missing subject")
    return false
  }

  if (env.isDev) {
    await writeDevLog(recipient, mailSubject, htmlBody ?? "", textBody ?? "")
    return true
  }

  if (!env.postmarkApiKey) {
    console.warn(`[email] POSTMARK_API_KEY not configured; skipping email to ${recipient}`)
    return false
  }

  if (!env.mailFromAddress) {
    console.warn(`[email] MAIL_FROM_ADDRESS not configured; skipping email to ${recipient}`)
    return false
  }

  try {
    const client = new postmark.ServerClient(env.postmarkApiKey)
    await client.sendEmail({
      From: env.mailFromAddress,
      To: recipient,
      Subject: mailSubject,
      HtmlBody: htmlBody ?? "",
      TextBody: textBody ?? "",
      MessageStream: "outbound",
    })
    return true
  } catch (exc) {
    Sentry.captureException(exc)
    console.error(`[email] Postmark send failed for ${recipient}:`, exc)
    return false
  }
}

// Fire-and-forget — does not block the caller. Node's event loop handles the
// concurrency; no thread pool needed (contrast with Flask's ThreadPoolExecutor).
export function sendEmailBackground(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): void {
  sendEmail(to, subject, htmlBody, textBody).catch((exc) => {
    Sentry.captureException(exc)
    console.error("[email] Background send threw unexpectedly:", exc)
  })
}

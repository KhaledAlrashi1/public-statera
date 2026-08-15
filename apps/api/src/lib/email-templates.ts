/*
 * Deliberate deviations from Flask (backend/email_service.py):
 * - Flask uses Jinja2 with full template inheritance and filters. Hono uses a
 *   lightweight {{ variable }} regex substitution. Template files contain only
 *   variable placeholders with no Jinja2 logic — substitution is semantically
 *   equivalent for these two templates.
 * - Flask reads templates from the filesystem (backend/templates/email/). Hono
 *   inlines template strings in code to avoid filesystem path resolution issues
 *   with tsx ESM. Template content is ported verbatim from Flask.
 * - Path traversal guard preserved exactly from Flask: reject names containing
 *   "..", "/", or "\".
 */

import { sendEmail } from "./email"

type TemplateContext = Record<string, string | number>

interface TemplatePair { html: string; text: string }

const TEMPLATES: Record<string, TemplatePair> = {
  budget_alert: {
    html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827;">
    <h2 style="margin: 0 0 12px;">Budget Alert</h2>
    <p style="margin: 0 0 8px;">
      You have used <strong>{{ ratio_pct }}%</strong> of your
      <strong>{{ category }}</strong> budget for {{ month_label }}.
    </p>
    <p style="margin: 0 0 8px;">Spent: KD {{ spent_kd }} of KD {{ budget_kd }}</p>
    <p style="margin: 0; color: #6b7280;">Open DinarTrack to review and adjust your plan.</p>
  </body>
</html>`,
    text: `Budget Alert

You have used {{ ratio_pct }}% of your {{ category }} budget for {{ month_label }}.
Spent: KD {{ spent_kd }} of KD {{ budget_kd }}.

Open DinarTrack to review and adjust your plan.`,
  },
  // Module 10e. ONE template for BOTH the sign-in and sign-up branches (10e-R65):
  // the copy below is true in either case, and a second variant is a place a future
  // edit can land on one branch only. It also makes the mail byte-identical for a
  // known and an unknown address, which strengthens the 10e-R14 uniformity property
  // beyond the HTTP response — see routes/magic-link.ts.
  //
  // NOTHING REQUEST-CONTROLLED IS INTERPOLATED HERE, and that is load-bearing because
  // interpolate() below does a bare String(val) with NO HTML escaping. {{ link }} is
  // an operator-configured origin plus a base64url token (alphabet [A-Za-z0-9_-], so
  // it cannot emit <, >, " or & and cannot break out of the href); {{ ttl_minutes }}
  // is a number derived from a constant. The user's address is deliberately NOT
  // interpolated. Do not add a placeholder carrying user input without escaping first.
  magic_link: {
    html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827;">
    <h2 style="margin: 0 0 12px;">Sign in to Statera</h2>
    <p style="margin: 0 0 16px;">
      Use the button below to sign in. This link expires in {{ ttl_minutes }} minutes,
      and requesting a new link replaces any earlier one.
    </p>
    <p style="margin: 0 0 16px;">
      <a href="{{ link }}" style="background:#111827;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Sign in to Statera</a>
    </p>
    <p style="margin: 0 0 8px; color: #6b7280;">If the button does not work, paste this into your browser:</p>
    <p style="margin: 0 0 16px; word-break: break-all; color: #6b7280;">{{ link }}</p>
    <p style="margin: 0; color: #6b7280;">If you did not request this, you can ignore this email — no account changes were made.</p>
  </body>
</html>`,
    text: `Sign in to Statera

Use this link to sign in. It expires in {{ ttl_minutes }} minutes, and requesting a new link replaces any earlier one.

{{ link }}

If you did not request this, you can ignore this email — no account changes were made.`,
  },
}

function interpolate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const val = context[key]
    return val !== undefined ? String(val) : ""
  })
}

export function renderEmailTemplate(
  templateName: string,
  context: TemplateContext,
): TemplatePair {
  const base = (templateName || "").trim()
  if (!base || base.includes("/") || base.includes("\\") || base.includes("..")) {
    throw new Error("Invalid template name")
  }
  const tpl = TEMPLATES[base]
  if (!tpl) throw new Error(`Unknown email template: ${base}`)
  return { html: interpolate(tpl.html, context), text: interpolate(tpl.text, context) }
}

export async function sendTemplatedEmail(
  to: string,
  subject: string,
  templateName: string,
  context: TemplateContext,
): Promise<boolean> {
  const { html, text } = renderEmailTemplate(templateName, context)
  return sendEmail(to, subject, html, text)
}

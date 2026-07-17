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

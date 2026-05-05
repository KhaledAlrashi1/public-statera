import { CheckCircle2, CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import type { FieldValidationTone } from "@/lib/validation"

export function validationInputClass(tone?: FieldValidationTone): string {
  if (tone === "valid") {
    return "border-success/45 bg-success/5 focus-visible:ring-success/20"
  }

  if (tone === "error") {
    return "border-destructive/45 bg-destructive/5 focus-visible:ring-destructive/20"
  }

  return ""
}

export function FieldFeedback({
  tone,
  message,
  className,
}: {
  tone?: FieldValidationTone
  message?: string
  className?: string
}) {
  if (!tone || !message) return null

  const Icon = tone === "valid" ? CheckCircle2 : CircleAlert

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs",
        tone === "valid" ? "text-success" : "text-destructive",
        className
      )}
    >
      <Icon className="icon-inline" />
      <span>{message}</span>
    </p>
  )
}

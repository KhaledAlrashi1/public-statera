import { today } from "@/lib/utils"

export type FieldValidationTone = "valid" | "error"

export type FieldValidation = {
  tone: FieldValidationTone
  message: string
}

function formatAmountLimit(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

export function validateRequiredDate(value: string): FieldValidation {
  const trimmed = value.trim()
  if (!trimmed) {
    return { tone: "error", message: "Date is required." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { tone: "error", message: "Enter a valid date." }
  }
  if (trimmed > today()) {
    return { tone: "error", message: "Date cannot be in the future." }
  }
  return { tone: "valid", message: "Date looks good." }
}

export function validateRequiredText(value: string, label: string): FieldValidation {
  if (!value.trim()) {
    return { tone: "error", message: `${label} is required.` }
  }
  return { tone: "valid", message: `${label} looks good.` }
}

export function validateOptionalTextMaxLength(
  value: string,
  label: string,
  max: number
): FieldValidation | null {
  if (value.length > max) {
    return { tone: "error", message: `${label} must be ${max} characters or fewer.` }
  }
  return null
}

export function validatePositiveAmount(
  value: string,
  label = "Amount",
  options?: { max?: number }
): FieldValidation {
  const trimmed = value.trim()
  if (!trimmed) {
    return { tone: "error", message: `${label} is required.` }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { tone: "error", message: `Enter a valid ${label.toLowerCase()}.` }
  }

  const decimalMatch = trimmed.match(/^[+-]?\d+\.(\d+)$/)
  if (decimalMatch && decimalMatch[1].length > 3) {
    return { tone: "error", message: `${label} cannot have more than 3 decimal places.` }
  }

  if (parsed <= 0) {
    return { tone: "error", message: `${label} must be greater than zero.` }
  }

  if (options?.max !== undefined && parsed > options.max) {
    return { tone: "error", message: `${label} must be ${formatAmountLimit(options.max)} or less.` }
  }

  return { tone: "valid", message: `${label} is ready to save.` }
}

export function validateNonNegativeAmount(
  value: string,
  label = "Amount",
  options?: { required?: boolean; max?: number }
): FieldValidation | null {
  const trimmed = value.trim()

  if (!trimmed) {
    if (options?.required) {
      return { tone: "error", message: `${label} is required.` }
    }
    return null
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { tone: "error", message: `Enter a valid ${label.toLowerCase()}.` }
  }

  if (parsed < 0) {
    return { tone: "error", message: `${label} cannot be negative.` }
  }

  if (options?.max !== undefined && parsed > options.max) {
    return { tone: "error", message: `${label} must be ${formatAmountLimit(options.max)} or less.` }
  }

  return { tone: "valid", message: `${label} looks good.` }
}

export function validateOptionalIntegerRange(
  value: string,
  label: string,
  min: number,
  max: number
): FieldValidation | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { tone: "error", message: `${label} must be an integer between ${min} and ${max}.` }
  }

  return { tone: "valid", message: `${label} looks good.` }
}

import Decimal from "decimal.js"

export function formatKd(value: string | number | Decimal | null | undefined): string {
  try {
    return new Decimal(String(value ?? "0")).toFixed(3)
  } catch {
    return "0.000"
  }
}

export function parseKd(raw: string): Decimal {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) throw new Error("Amount is required.")
  let d: Decimal
  try {
    d = new Decimal(trimmed)
  } catch {
    throw new Error("Amount is invalid.")
  }
  if (d.decimalPlaces() > 3) throw new Error("Amount cannot have more than 3 decimal places.")
  if (d.lte(0)) throw new Error("Amount must be greater than zero.")
  return d
}

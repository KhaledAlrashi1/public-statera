import { cn } from "@/lib/utils"

type CategoryBadgeProps = {
  category: string
  // MOB-R77 C6 — whether the category counts as income, from the API; the badge keeps no copy of the rule.
  countsAsIncome: boolean
  className?: string
}

export function txnBadgeClass(countsAsIncome: boolean, className?: string): string {
  const income = countsAsIncome
  return cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    income ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
    className
  )
}

export function CategoryBadge({ category, countsAsIncome, className }: CategoryBadgeProps) {
  return (
    <span className={txnBadgeClass(countsAsIncome, className)}>
      {category || "Uncategorized"}
    </span>
  )
}

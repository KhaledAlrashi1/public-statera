import { cn, isIncome } from "@/lib/utils"

type CategoryBadgeProps = {
  category: string
  className?: string
}

export function txnBadgeClass(category: string, className?: string): string {
  const income = isIncome(category)
  return cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    income ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
    className
  )
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span className={txnBadgeClass(category, className)}>
      {category || "Uncategorized"}
    </span>
  )
}

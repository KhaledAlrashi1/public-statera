import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Tab<T extends string> = { id: T; label: string }

type SegmentedControlProps<T extends string> = {
  tabs: Tab<T>[]
  value: T
  onChange: (id: T) => void
  activeClassName?: string
  ariaLabel?: string
}

export function SegmentedControl<T extends string>({
  tabs,
  value,
  onChange,
  activeClassName = "bg-card text-primary shadow-sm ring-1 ring-primary/15",
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="inline-flex h-10 items-center rounded-full border border-border/70 bg-muted/40 p-1 text-sm font-semibold"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full px-4 transition-all duration-150",
            value === tab.id
              ? cn(activeClassName, "hover:bg-card")
              : "text-muted-foreground hover:bg-transparent hover:text-foreground"
          )}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

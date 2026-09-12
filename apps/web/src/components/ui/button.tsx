import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // pointer-coarse:min-h-11 / min-w-11 put every button at the 44px touch minimum on
  // coarse-pointer devices and leave desktop untouched. It lives on the BASE rather than in the
  // size table so it covers all 190 call sites including the 61 that override the height
  // in-tag; min-* raises without capping, so the FAB's h-14 (56px) is unaffected.
  // NOTE: this is a device-capability switch, not a width switch — it fires on a touch laptop
  // and does NOT fire in a narrow desktop window. See the close-out's divergence note.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:border-primary/25 hover:bg-primary/8 hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-primary/6 hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        pill:
          "rounded-full border border-input bg-background shadow-sm hover:bg-muted/70 text-foreground font-semibold",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8 text-base",
        icon: "h-9 w-9",
        pill: "h-10 px-4 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, variant, size, asChild = false, loading = false, disabled, ...props }, ref) => {
    const classNames = cn(buttonVariants({ variant, size, className }))

    if (asChild) {
      return (
        <Slot
          className={classNames}
          ref={ref}
          aria-busy={loading || undefined}
          data-loading={loading ? "true" : undefined}
          {...props}
        />
      )
    }

    return (
      <button
        className={classNames}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading ? "true" : undefined}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

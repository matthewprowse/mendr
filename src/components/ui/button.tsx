import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Lime — primary action */
        default:
          "border border-primary bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)]",
        /** White with border — secondary / neutral action */
        outline:
          "border border-border bg-background text-foreground hover:bg-muted",
        /** Same as outline — alias for shadcn compat */
        secondary:
          "border border-border bg-background text-foreground hover:bg-muted",
        /** Borderless — tertiary / low-emphasis action */
        ghost:
          "bg-transparent text-foreground hover:bg-muted",
        /** Red tint — destructive / danger action */
        destructive:
          "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        /** Text-only — inline link */
        link: "bg-transparent text-[color:var(--menda-link)] underline-offset-4 hover:underline",
      },
      size: {
        xs:      "h-7 px-2.5 text-xs",
        sm:      "h-8 gap-1.5 px-3 text-sm",
        default: "h-9 px-4 text-sm",
        lg:      "h-10 px-5 text-sm",
        xl:      "h-11 px-6 text-base",
        icon:       "size-9",
        "icon-xs":  "size-7",
        "icon-sm":  "size-8",
        "icon-lg":  "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

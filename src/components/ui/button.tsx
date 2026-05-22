import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Lime — primary action */
        default:
          "border border-primary bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)]",
        /** White with border — neutral / cancel action */
        outline:
          "border border-border bg-background text-foreground hover:bg-muted",
        /** Filled muted — secondary action (distinct from outline) */
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-[#EAEAEA]",
        /** Borderless — tertiary / low-emphasis action */
        ghost:
          "bg-transparent text-foreground hover:bg-muted",
        /** Solid red — destructive / danger action */
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        /** Text-only — inline link */
        link: "bg-transparent text-foreground underline-offset-4 hover:underline",
      },
      size: {
        xs:      "h-7 px-2.5 text-xs",
        sm:      "h-9 gap-1.5 px-3 text-sm",
        default: "h-10 px-4 text-sm",
        lg:      "h-11 px-5 text-sm",
        xl:      "h-11 px-6 text-base",
        icon:       "size-10",
        "icon-xs":  "size-7",
        "icon-sm":  "size-9",
        "icon-lg":  "size-11",
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

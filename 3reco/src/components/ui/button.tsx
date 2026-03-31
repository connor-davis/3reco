import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color,border-color,color] duration-200 outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[var(--shadow-glass)]",
        outline:
          "border-[var(--glass-border)] bg-white/70 text-foreground shadow-[var(--shadow-soft)] backdrop-blur-md hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-[var(--shadow-glass)] aria-expanded:bg-white/85 aria-expanded:text-foreground dark:bg-white/5 dark:hover:bg-white/10 dark:aria-expanded:bg-white/10",
        secondary:
          "border border-white/25 bg-white/80 text-secondary-foreground shadow-[var(--shadow-soft)] backdrop-blur-md hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-[var(--shadow-glass)] aria-expanded:bg-white/95 aria-expanded:text-secondary-foreground dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12 dark:aria-expanded:bg-white/12",
        ghost:
          "hover:bg-white/65 hover:text-foreground hover:shadow-[var(--shadow-soft)] aria-expanded:bg-white/75 aria-expanded:text-foreground dark:hover:bg-white/8 dark:aria-expanded:bg-white/10",
        destructive:
          "bg-destructive text-white shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-destructive/90 hover:shadow-[var(--shadow-glass)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        destructiveGhost:
          "text-destructive hover:bg-destructive/12 focus-visible:ring-destructive/20 dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

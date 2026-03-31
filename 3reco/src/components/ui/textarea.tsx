import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-2xl border border-[var(--glass-border)] bg-white/70 px-3 py-3 text-base shadow-[var(--shadow-soft)] backdrop-blur-md transition-[background-color,border-color,box-shadow] outline-none placeholder:text-muted-foreground/90 hover:bg-white/85 focus-visible:border-ring focus-visible:bg-white/95 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:shadow-[var(--shadow-glass)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:bg-white/5 dark:hover:bg-white/8 dark:focus-visible:bg-white/10 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-[0.25rem] bg-(--ca-card) px-3.5 py-2.5 text-base text-(--ca-ink) shadow-[inset_0_0_0_1px_var(--ca-line)] transition-shadow outline-none placeholder:text-(--ca-soft) hover:shadow-[inset_0_0_0_1px_var(--ca-soft)] focus-visible:shadow-[inset_0_0_0_1px_var(--ca-ink)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

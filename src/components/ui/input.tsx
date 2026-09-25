import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[0.25rem] bg-(--ca-card) px-3.5 py-2 text-base text-(--ca-ink) shadow-[inset_0_0_0_1px_var(--ca-line)] transition-shadow outline-none file:mr-4 file:inline-flex file:h-7 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-(--ca-ink) placeholder:text-(--ca-soft) hover:shadow-[inset_0_0_0_1px_var(--ca-soft)] focus-visible:shadow-[inset_0_0_0_1px_var(--ca-ink)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }

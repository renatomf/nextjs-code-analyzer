import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Code Analyzer look: square slabs with corner ticks (`ca-corners`), mint
// primary, flat outline/ghost. Tokens come from `--ca-*` in globals.css.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent text-[0.8125rem] font-medium tracking-[-0.01em] whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ca-ink) active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "ca-corners bg-(--ca-green) text-[#050505] [--ca-corner:#050505] hover:bg-[#5cffdc]",
        night:
          "ca-corners bg-(--ca-night-3) text-[#fafafa] [--ca-corner:var(--ca-green)] hover:bg-[#262626]",
        outline:
          "border-(--ca-line) bg-(--ca-card) text-(--ca-ink) hover:border-(--ca-green-deep) hover:bg-(--ca-green)/15 aria-expanded:border-(--ca-green-deep) aria-expanded:bg-(--ca-green)/15",
        secondary:
          "ca-corners bg-[#e0e0e0] text-[#050505] [--ca-corner:#050505] hover:bg-[#d4d4d4] aria-expanded:bg-[#d4d4d4] dark:bg-[#1a1a1a] dark:text-[#fafafa] dark:[--ca-corner:var(--ca-green)] dark:hover:bg-[#262626] dark:aria-expanded:bg-[#262626]",
        ghost:
          "text-(--ca-muted) hover:bg-(--ca-card) hover:text-(--ca-ink) aria-expanded:bg-(--ca-card) aria-expanded:text-(--ca-ink)",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-(--ca-ink) underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-sm has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
      // Landing-style bar: full width, label left, dotted handle right.
      bar: {
        true: "ca-handle flex justify-between gap-4 pr-3.5 pl-4",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      bar: false,
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  bar = false,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, bar, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

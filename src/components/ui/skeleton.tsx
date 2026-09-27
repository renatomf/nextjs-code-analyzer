import { cn } from "@/lib/utils"

// shadcn Skeleton, restyled for Kudos: line color, square corners.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-none bg-(--ca-line)", className)}
      {...props}
    />
  )
}

export { Skeleton }

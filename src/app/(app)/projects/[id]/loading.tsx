import { Skeleton } from "@/components/ui/skeleton";

// Overview skeleton: same card as the page (info grid + actions). Shown
// instantly under the kept project header and tabs; prefetched by the tabs.
export default function OverviewLoading() {
  return (
    <main className="flex-1" aria-busy="true" aria-label="Loading overview">
      <div className="ca-container py-10">
        <div className="ca-panel space-y-6 p-5">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
          <div className="space-y-3 border-t border-(--ca-line) pt-4">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
      </div>
    </main>
  );
}

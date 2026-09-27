import { Skeleton } from "@/components/ui/skeleton";

// Issues skeleton: dashboard card with severity chips, two filters, list.
export default function IssuesLoading() {
  return (
    <main className="flex-1" aria-busy="true" aria-label="Loading issues">
      <div className="ca-container py-10">
        <div className="ca-panel space-y-6 p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-20" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <ul className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="space-y-2 rounded-[0.375rem] border border-(--ca-line) p-4">
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-40" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

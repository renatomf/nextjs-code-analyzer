import { Skeleton } from "@/components/ui/skeleton";

// Report skeleton: hero score + category grid, category summaries, roadmap.
export default function ReportLoading() {
  return (
    <main className="flex-1" aria-busy="true" aria-label="Loading report">
      <div className="ca-container flex flex-col gap-6 py-10">
        <section className="ca-panel p-6 sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-20 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-1.5 w-full max-w-md" />
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-xl">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="space-y-2 rounded-[0.375rem] border border-(--ca-line) p-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-10" />
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {Array.from({ length: 5 }, (_, index) => (
            <article
              key={index}
              className="ca-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6"
            >
              <Skeleton className="size-11 shrink-0" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </article>
          ))}
        </section>

        <section className="ca-panel space-y-3 p-5 sm:p-6">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </section>
      </div>
    </main>
  );
}

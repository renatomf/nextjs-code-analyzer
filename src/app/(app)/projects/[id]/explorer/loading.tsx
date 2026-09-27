import { Skeleton } from "@/components/ui/skeleton";

// Explorer skeleton: the same three panels and fixed height as CodeExplorer
// (files, code with its dark bar, AI panel).
export default function ExplorerLoading() {
  return (
    <main className="flex-1" aria-busy="true" aria-label="Loading explorer">
      <div className="ca-container py-10">
        <div className="grid min-w-0 gap-4 [--explorer-h:min(75vh,47rem)] lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(0,300px)]">
          <section className="ca-panel flex h-(--explorer-h) min-w-0 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-(--ca-line) px-3.5 py-2.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
            <div className="space-y-2.5 p-3">
              {Array.from({ length: 12 }, (_, index) => (
                <Skeleton
                  key={index}
                  className="h-3.5"
                  style={{ width: `${45 + ((index * 17) % 45)}%` }}
                />
              ))}
            </div>
          </section>

          <section className="ca-panel flex h-(--explorer-h) min-w-0 flex-col">
            <div className="flex shrink-0 items-center gap-2.5 border-b border-(--ca-night-line) bg-(--ca-night) px-4 py-3">
              <span className="ca-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <Skeleton className="h-3 w-40 bg-white/15" />
            </div>
            <div className="min-h-0 flex-1 space-y-3 bg-(--ca-card) px-4 py-5">
              {Array.from({ length: 14 }, (_, index) => (
                <Skeleton
                  key={index}
                  className="h-3"
                  style={{ width: `${25 + ((index * 23) % 60)}%` }}
                />
              ))}
            </div>
          </section>

          <section className="ca-panel h-fit min-w-0 space-y-3 p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-24" />
          </section>
        </div>
      </div>
    </main>
  );
}

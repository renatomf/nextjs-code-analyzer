// Generic skeleton for the analysis progress page (the other tabs have their
// own, shaped like each screen).
export default function ProgressLoading() {
  return (
    <main className="flex-1" aria-busy="true" aria-label="Loading">
      <div className="ca-container space-y-4 py-10">
        <div className="ca-panel h-36 animate-pulse p-6">
          <div className="h-3 w-28 bg-(--ca-line)" />
          <div className="mt-6 h-8 w-40 bg-(--ca-line)" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="ca-panel h-28 animate-pulse" />
          <div className="ca-panel h-28 animate-pulse" />
        </div>
        <div className="ca-panel h-48 animate-pulse" />
      </div>
    </main>
  );
}

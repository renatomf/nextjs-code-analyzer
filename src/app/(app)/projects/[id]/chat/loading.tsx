import { Skeleton } from "@/components/ui/skeleton";

// Chat skeleton: same full-height column as ProjectChat (intro, stretched
// conversation, input at the bottom). `data-chat-fill` gives it the same
// screen-high shell, so nothing jumps when the chat arrives.
export default function ChatLoading() {
  return (
    <main
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <div className="ca-container flex min-h-0 flex-1 flex-col pt-10 pb-6">
        <div data-chat-fill className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0 rounded-[0.375rem] border border-(--ca-line) bg-(--ca-card) px-4 py-3">
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          <div className="flex min-h-32 flex-1 flex-col gap-3 rounded-[0.375rem] border border-(--ca-line) bg-(--ca-card) p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-20 w-full shrink-0 rounded-[0.375rem]" />
        </div>
      </div>
    </main>
  );
}

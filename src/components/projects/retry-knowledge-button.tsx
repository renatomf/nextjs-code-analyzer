"use client";

import { Button } from "@/components/ui/button";
import { retryProjectKnowledge, type RetryState } from "@/lib/actions/analysis";
import { useActionState } from "react";

const initialState: RetryState = {};

export function RetryKnowledgeButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    retryProjectKnowledge,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Rebuilding knowledge..." : "Retry knowledge build"}
      </Button>
    </form>
  );
}

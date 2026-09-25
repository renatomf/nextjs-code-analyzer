"use client";

import { ActionAlert } from "@/components/ui/action-alert";
import { Button } from "@/components/ui/button";
import {
  generateReportAction,
  retryFullAnalysis,
  type RetryState,
} from "@/lib/actions/analysis";
import { useActionState, useState } from "react";

const initialState: RetryState = {};

export function GenerateReportButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    generateReportAction,
    initialState,
  );
  const [dismissed, setDismissed] = useState(false);
  const showError = Boolean(state.error) && !dismissed;

  return (
    <form
      action={(formData) => {
        setDismissed(false);
        formAction(formData);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {showError && state.error ? (
        <ActionAlert
          title="Couldn't generate report"
          message={state.error}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Generating report..." : "Generate health report"}
      </Button>
    </form>
  );
}

export function RetryFullAnalysisButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    retryFullAnalysis,
    initialState,
  );
  const [dismissed, setDismissed] = useState(false);
  const showError = Boolean(state.error) && !dismissed;

  return (
    <form
      action={(formData) => {
        setDismissed(false);
        formAction(formData);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {showError && state.error ? (
        <ActionAlert
          title="Couldn't restart analysis"
          message={state.error}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}
      <Button type="submit" disabled={pending} variant="outline">
        {pending ? "Starting..." : "Analyze again"}
      </Button>
    </form>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cancelAnalysis } from "@/lib/actions/projects";
import { ANALYSIS_STEPS } from "@/lib/analysis/progress-steps";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  useAnalysisProgress,
  type ProgressState,
} from "@/components/projects/use-analysis-progress";

export function AnalysisProgress({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProgressState;
}) {
  const router = useRouter();
  const { state, startError, finished, retry } = useAnalysisProgress(projectId, initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Leaving for the dashboard: never flash the failed card meanwhile.
  const [canceled, setCanceled] = useState(false);

  return (
    <div className="space-y-5">
      <div className="ca-panel p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="ca-kicker">Current step</p>
            <p className="mt-4 text-lg font-semibold tracking-tight">
              {state.progressStep ?? "Waiting to start..."}
            </p>
          </div>
          <p className="ca-title text-5xl tabular-nums text-(--ca-green-deep)">
            {state.progressPercent}%
          </p>
        </div>

        <div className="h-1.5 overflow-hidden bg-(--ca-line)">
          <div
            className="h-full bg-(--ca-green-deep) transition-all duration-500"
            style={{ width: `${Math.min(100, state.progressPercent)}%` }}
          />
        </div>

        <ul className="mt-7 space-y-3">
          {ANALYSIS_STEPS.filter((step) => step.id !== "done").map((step) => {
            const complete =
              state.status === "completed" ||
              state.progressPercent >= step.percent;
            const active =
              !complete &&
              state.status !== "failed" &&
              state.progressPercent >= step.percent - 20 &&
              state.progressPercent < step.percent;

            return (
              <li key={step.id} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center border font-mono text-xs",
                    complete &&
                      "border-(--ca-green-deep) bg-(--ca-green) text-[#050505]",
                    active &&
                      "border-(--ca-green-deep) text-(--ca-green-deep)",
                    !complete &&
                      !active &&
                      "border-(--ca-line) text-(--ca-muted)",
                  )}
                >
                  {complete ? "✓" : active ? "…" : ""}
                </span>
                <span
                  className={cn(
                    complete || active
                      ? "font-medium text-(--ca-ink)"
                      : "text-(--ca-muted)",
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>

        {!finished && !startError && !canceled ? (
          <div className="mt-7 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              mint
              onClick={() => setCancelOpen(true)}
            >
              Cancel analysis
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        kicker="Analysis"
        titleDim="Cancel"
        title="this analysis?"
        description="The analysis stops and this project is deleted, with its files and everything analyzed so far. You can import it again later."
        confirmLabel="Cancel analysis"
        pendingLabel="Canceling…"
        onConfirm={async () => {
          const result = await cancelAnalysis(projectId).catch(() => ({
            error: "Could not cancel the analysis. Try again.",
          }));
          setCancelOpen(false);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          setCanceled(true);
          toast.error("Analysis canceled.");
          router.push("/dashboard");
        }}
      />

      <div className="ca-panel space-y-1.5 p-5 text-sm text-(--ca-muted)">
        <p>
          Framework:{" "}
          <span className="text-(--ca-ink)">
            {state.framework ?? "Detecting..."}
          </span>
        </p>
        <p>
          Source files:{" "}
          <span className="text-(--ca-ink)">{state.fileCount || "—"}</span>
        </p>
        {state.report ? (
          <p>
            Health score:{" "}
            <span className="font-semibold text-(--ca-green-deep)">
              {state.report.healthScore}/100
            </span>
          </p>
        ) : null}
      </div>

      {(state.status === "failed" || startError) && !canceled ? (
        <div className="ca-panel space-y-3 border-l-2 border-l-destructive bg-destructive/5 p-5">
          <p className="text-sm text-destructive">
            {startError ?? state.errorMessage ?? "Analysis failed."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void retry()}>
              Retry analysis
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/projects/${projectId}`} />}
            >
              Open overview
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "completed" ? (
        <div className="ca-panel p-5 text-sm">
          Analysis complete. Redirecting to the health report...
          <div className="mt-3">
            <Button
              nativeButton={false}
              render={<Link href={`/projects/${projectId}/report`} />}
            >
              View report now
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

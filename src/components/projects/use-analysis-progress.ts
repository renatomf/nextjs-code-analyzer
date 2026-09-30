"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type ProgressState = {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  progressStep: string | null;
  progressPercent: number;
  errorMessage: string | null;
  framework: string | null;
  fileCount: number;
  report: { healthScore: number } | null;
};

type AnalyzeResponse = {
  error?: string;
  status?: ProgressState["status"];
  progressStep?: string;
  progressPercent?: number;
};

/**
 * The live analysis of a project: starts it once if nobody did, polls the
 * status until it finishes, refreshes and redirects to the report when it
 * completes, and retries on demand. In Phase 5 it will read the job's
 * progress instead.
 */
export function useAnalysisProgress(projectId: string, initial: ProgressState) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const startedRef = useRef(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Nothing changes after these states, so polling stops (a retry resumes it).
  const finished = state.status === "completed" || state.status === "failed";

  useEffect(() => {
    if (finished) return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/projects/${projectId}/status`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as ProgressState;
        if (!cancelled) setState(data);
      } catch {
        // ignore transient poll errors
      }
    }

    const timer = window.setInterval(() => {
      void poll();
    }, 1500);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, finished]);

  useEffect(() => {
    if (startedRef.current) return;
    if (state.status === "completed" || state.status === "failed") return;
    if (state.status === "processing" && state.progressPercent >= 30) return;

    startedRef.current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/analyze`, {
          method: "POST",
        });
        const data = (await response.json()) as AnalyzeResponse;
        if (!response.ok && data.error) {
          setStartError(data.error);
          return;
        }
        if (data.status) {
          setState((current) => ({
            ...current,
            status: data.status ?? current.status,
            progressStep: data.progressStep ?? current.progressStep,
            progressPercent: data.progressPercent ?? current.progressPercent,
          }));
        }
      } catch (error) {
        setStartError(
          error instanceof Error ? error.message : "Failed to start analysis",
        );
      }
    })();
  }, [projectId, state.progressPercent, state.status]);

  useEffect(() => {
    if (state.status === "completed") {
      // The project layout (status, unlocked tabs, issue count) is not
      // re-fetched on navigation: refresh it once now that the report exists.
      router.refresh();
      const timer = window.setTimeout(() => {
        router.push(`/projects/${projectId}/report`);
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [state.status, projectId, router]);

  async function retry() {
    setStartError(null);
    startedRef.current = true;
    setState((current) => ({
      ...current,
      status: "processing",
      progressStep: "Starting analysis",
      progressPercent: Math.max(current.progressPercent, 30),
      errorMessage: null,
    }));

    try {
      const response = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
      });
      const data = (await response.json()) as AnalyzeResponse;
      if (!response.ok && data.error) {
        setStartError(data.error);
        return;
      }
      if (data.status) {
        setState((current) => ({
          ...current,
          status: data.status ?? current.status,
          progressStep: data.progressStep ?? current.progressStep,
          progressPercent: data.progressPercent ?? current.progressPercent,
        }));
      }
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Failed to start analysis",
      );
    }
  }

  return { state, startError, finished, retry };
}

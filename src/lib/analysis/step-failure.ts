import { DomainError } from "@/shared/errors";
import { AnalysisCanceledError } from "@/modules/projects";

/**
 * How the analysis workflow treats a failed step (ADR-005). Kept apart from
 * the workflow file so it can be tested without the Workflow runtime.
 */

/** Retries after the first attempt. The report step calls the LLM: each retry costs tokens. */
export const STEP_MAX_RETRIES = 2;

/** `attempt` is the Workflow SDK's step attempt, starting at 1. */
export function isFinalAttempt(attempt: number): boolean {
  return attempt > STEP_MAX_RETRIES;
}

export type StepFailure = {
  /** No retry: the same input fails the same way. */
  fatal: boolean;
  /**
   * What the step throws. Workflow stores step errors with the run, so it is
   * a safe message: a user error's own text, or a generic one (the real error
   * is in the logs and Sentry).
   */
  message: string;
};

export function classifyStepFailure(error: unknown): StepFailure {
  if (error instanceof AnalysisCanceledError) {
    return { fatal: true, message: error.message };
  }
  if (error instanceof DomainError) {
    return { fatal: true, message: error.message };
  }
  return { fatal: false, message: "Analysis step failed." };
}

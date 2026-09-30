/** Shared by the evals that call the LLM (review and chat). */

/** Provider errors name the Groq organization: never write it to results. */
export function describeError(error: unknown) {
  const mask = (text: string) => text.replace(/org_[A-Za-z0-9]+/g, "org_***");
  // After the SDK's retries the provider's answer is on the last error.
  const cause = (error as { lastError?: unknown }).lastError ?? error;
  const body = (cause as { responseBody?: string }).responseBody;
  return { error: mask(String(error)), responseBody: body ? mask(body).slice(0, 4000) : undefined };
}

/** vitest.eval.config.mts fills GROQ_API_KEY from GROQ_EVAL_API_KEY only. */
export function assertEvalKey() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "RUN_LLM_EVAL needs GROQ_EVAL_API_KEY (a key from a separate Groq account, in .env.local or a CI secret); the production key is never used for evals.",
    );
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

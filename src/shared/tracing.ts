import { startSpan } from "@sentry/nextjs";

/**
 * Times one step as a span of the current trace (roadmap Phase 4: time per
 * pipeline step, cold start, chat retrieval). A no-op when Sentry is off.
 * Attributes are counts only: never code, paths, questions or ids.
 */
export function traced<T>(
  name: string,
  attributes: Record<string, number>,
  work: () => Promise<T>,
): Promise<T> {
  return startSpan({ name, op: "function", attributes }, work);
}

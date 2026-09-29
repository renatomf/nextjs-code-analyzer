import "server-only";

import { DomainError } from "@/shared/errors";
import { logger } from "@/shared/logger";

/**
 * The message safe to show for `error`: a DomainError's own message, or
 * `fallback` for anything else — which is logged with its real cause
 * (TD-26), since it is unexpected. Replaces the per-file copies (TD-32).
 */
export function publicErrorMessage(
  error: unknown,
  fallback: string,
  event = "action.failed",
): string {
  if (error instanceof DomainError) return error.message;
  logger.error(event, { err: error, message: fallback });
  return fallback;
}

import type { Instrumentation } from "next";

/**
 * Runs once when a server instance starts (never during `next build`).
 * A missing or malformed required variable stops the server here, with a
 * clear log line, instead of failing later inside a user request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/shared/env");
  const { logger } = await import("@/shared/logger");

  try {
    const { disabledFeatures, warnings } = validateEnv();
    if (warnings.length > 0) {
      logger.error("env.optional_invalid", { problems: warnings });
    }
    if (disabledFeatures.length > 0) {
      logger.warn("env.features_disabled", { features: disabledFeatures });
    }
  } catch (error) {
    logger.error("env.invalid", { err: error });
    throw error;
  }
}

/**
 * Unhandled server errors (Server Components, Server Actions, Route
 * Handlers). Headers are not logged: they carry cookies.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/shared/logger");
  const requestId = request.headers["x-vercel-id"];

  logger.error("request.unhandled_error", {
    err: error,
    requestId: typeof requestId === "string" ? requestId : undefined,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  });
};

import type { Instrumentation } from "next";

/**
 * Runs once when a server instance starts (never during `next build`).
 * A missing or malformed required variable stops the server here, with a
 * clear log line, instead of failing later inside a user request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/shared/env");
  const { logger, setErrorReporter } = await import("@/shared/logger");

  // First, so a bad environment below is reported too. No DSN = off.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const Sentry = dsn ? await import("@sentry/nextjs") : null;
  if (Sentry) {
    const { sentryOptions } = await import("@/shared/sentry-options");
    const { waitUntil } = await import("@vercel/functions");
    Sentry.init(sentryOptions(dsn, process.env.VERCEL_ENV));

    // Vercel freezes the function once the response is sent, so buffered
    // events must be flushed inside waitUntil (withSentryConfig's wrappers
    // would do it; this app does not use them). No-op outside Vercel.
    const flushLater = () => waitUntil(Sentry.flush(2_000));
    Sentry.getClient()?.on("spanEnd", (span) => {
      if (span === Sentry.getRootSpan(span)) flushLater();
    });

    setErrorReporter((event, err, requestId) => {
      const scope = { tags: { log_event: event, ...(requestId ? { request_id: requestId } : {}) } };
      if (err === undefined) Sentry.captureMessage(event, { level: "error", ...scope });
      else Sentry.captureException(err, scope);
      flushLater();
    });
  }

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
    // The server stops here: send the event before it does.
    await Sentry?.flush(2_000);
    throw error;
  }
}

/**
 * Unhandled server errors (Server Components, Server Actions, Route
 * Handlers). Headers are not logged: they carry cookies. `logger.error`
 * also sends it to Sentry (see register).
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

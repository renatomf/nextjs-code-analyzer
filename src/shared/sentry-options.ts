import type { Breadcrumb, BrowserOptions, Event } from "@sentry/nextjs";

import { REDACTED, redactSecrets } from "./redact";

/**
 * Sentry options shared by the server (`instrumentation.ts`) and the browser
 * (`instrumentation-client.ts`), roadmap Phase 4. Events must carry no PII
 * and none of the user's source code: no request bodies (uploads, chat
 * questions), headers or cookies, no query strings (file paths in the
 * explorer), no share tokens, no extra error data (AI SDK errors hold the
 * prompt, which holds the user's code), and secrets redacted from messages.
 * Session Replay is never enabled: it would record the code on screen.
 */

// Contexts the SDK sets about the runtime; anything else is dropped.
const SAFE_CONTEXTS = new Set(["app", "browser", "cloud_resource", "culture", "device", "os", "runtime", "trace"]);

/** Path only (no query or hash), with share tokens (`/r/<token>`) removed. */
export function scrubUrl(url: string): string {
  const [path] = url.split(/[?#]/, 1);
  return path.replace(/\/r\/[^/]+/, `/r/${REDACTED}`);
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console lines can hold anything; the structured logs live in Vercel.
  if (breadcrumb.category === "console") return null;
  const url = breadcrumb.data?.url;
  return {
    ...breadcrumb,
    message: breadcrumb.message ? redactSecrets(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data
      ? {
          ...(typeof url === "string" ? { url: scrubUrl(url) } : {}),
          ...(breadcrumb.data.method ? { method: breadcrumb.data.method } : {}),
          ...(breadcrumb.data.status_code ? { status_code: breadcrumb.data.status_code } : {}),
        }
      : undefined,
  };
}

export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    event.request = {
      ...(event.request.method ? { method: event.request.method } : {}),
      ...(event.request.url ? { url: scrubUrl(event.request.url) } : {}),
    };
  }
  delete event.user;
  delete event.extra;
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (!SAFE_CONTEXTS.has(key)) delete event.contexts[key];
    }
  }
  if (event.message) event.message = redactSecrets(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubUrl(redactSecrets(span.description));
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  }
  return event;
}

/** `undefined` DSN = Sentry stays off (local dev, tests, CI). */
export function sentryOptions(dsn: string | undefined, environment: string | undefined) {
  return {
    dsn: dsn || undefined,
    environment: environment ?? "development",
    // SDK v11 collects all of these by default. Off: the AI integration
    // would send prompts and answers (the user's code), DB spans the query
    // values, HTTP spans bodies, headers and cookies. Frame context lines
    // stay: they are this app's own (public) source, not the user's.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Errors are all kept; traces are sampled (Sentry's free tier).
    tracesSampleRate: environment === "production" ? 0.1 : 1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies BrowserOptions;
}

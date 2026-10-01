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

type StreamedSpan = Parameters<NonNullable<BrowserOptions["beforeSendSpan"]>>[0];

// Span attributes that can carry a query, cookies, headers, a body or the
// visitor's address: dropped whatever the SDK's dataCollection does.
const DROPPED_ATTRIBUTE = /(^|\.)(query|cookies?|headers?|body)(\.|$)|^user\.|^client\.address$|\.ip$/i;
const URL_ATTRIBUTE = /url|target|path|route|referr?er|location/i;

/**
 * Traces are streamed as spans (SDK 11 default), which `beforeSend*` never
 * sees: the span name and URL attributes (`url.full`) would carry share
 * tokens (`/r/<token>`) to Sentry. Same rules as scrubEvent.
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  const attributes: StreamedSpan["attributes"] = {};
  for (const [key, value] of Object.entries(span.attributes)) {
    if (DROPPED_ATTRIBUTE.test(key)) continue;
    if (typeof value !== "string") {
      attributes[key] = value;
      continue;
    }
    const isUrl = URL_ATTRIBUTE.test(key) || /^(https?:\/)?\//.test(value);
    attributes[key] = isUrl ? scrubUrl(redactSecrets(value)) : redactSecrets(value);
  }
  return { ...span, name: scrubUrl(redactSecrets(span.name)), attributes };
}

// Routes the baseline measures (docs/baseline.md §5): rare and costly, so
// every request is traced; the rest is sampled.
const MEASURED_ROUTE = /\/api\/(chat|explorer\/explain|projects\/[^/\s]+\/analyze)(?![\w/])/;

type SamplingContext = Parameters<NonNullable<BrowserOptions["tracesSampler"]>>[0];

export function tracesSamplerFor(environment: string | undefined) {
  const rate = environment === "production" ? 0.1 : 1;
  return (context: SamplingContext): number => {
    const target = [context.name, ...Object.values(context.attributes ?? {})]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    return MEASURED_ROUTE.test(target) ? 1 : context.inheritOrSampleWith(rate);
  };
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
    // Errors are all kept; traces are sampled (Sentry's free tier), except
    // the measured routes.
    tracesSampler: tracesSamplerFor(environment),
    beforeSend: scrubEvent,
    // Traces are streamed (SDK 11): beforeSendTransaction would be ignored.
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies BrowserOptions;
}

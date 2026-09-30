import { randomUUID } from "node:crypto";

import { REDACTED, redactSecrets } from "./redact";

/**
 * Structured server-side logger (TD-26). One JSON line per event, which the
 * Vercel log viewer can filter by field. It carries the real error (name,
 * message, stack) for diagnosis — clients still get generic messages — and
 * redacts secrets from field names and from free text (error messages from
 * drivers and SDKs can contain connection strings or keys).
 */

type Level = "info" | "warn" | "error";

export type LogFields = {
  /** Correlates every log line of one request (see requestIdFrom). */
  requestId?: string;
  userId?: string;
  projectId?: string;
  err?: unknown;
  [key: string]: unknown;
};

const MAX_DEPTH = 4;
const MAX_STRING = 2000;

const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|database_url|private[-_]?key/i;

export function redactText(text: string): string {
  const out = redactSecrets(text);
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redactText(err.message),
      ...(err.stack ? { stack: redactText(err.stack) } : {}),
      ...(err.cause !== undefined ? { cause: sanitize(err.cause, 1, new WeakSet()) } : {}),
    };
  }
  return { value: sanitize(err, 1, new WeakSet()) };
}

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return serializeError(value);
  if (seen.has(value)) return "[Circular]";
  if (depth > MAX_DEPTH) return "[Truncated]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1, seen);
  }
  return out;
}

function write(level: Level, event: string, fields: LogFields = {}) {
  const { err, ...rest } = fields;
  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...(sanitize(rest, 0, new WeakSet()) as Record<string, unknown>),
    ...(err !== undefined ? { error: serializeError(err) } : {}),
  };

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ level, event, time: entry.time, note: "unserializable fields" });
  }

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

/** Vercel's request id when present, so log lines match the request log. */
export function requestIdFrom(headers?: Headers | null): string {
  return headers?.get("x-vercel-id") ?? headers?.get("x-request-id") ?? randomUUID();
}

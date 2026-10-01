import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
  scrubUrl,
  sentryOptions,
  tracesSamplerFor,
} from "./sentry-options";

// What leaves for Sentry (roadmap Phase 4): no PII, none of the user's code,
// no secrets, no share tokens.

const USER_CODE = "export const secret = process.env.STRIPE_SECRET_KEY;";

function errorEvent(): ErrorEvent {
  return {
    type: undefined,
    message: "failed: postgres://app:hunter2@db.internal/app",
    request: {
      method: "POST",
      url: "https://app.example/api/explorer/file?projectId=p1&file=src/secret.ts#L3",
      data: { question: "why?", code: USER_CODE },
      headers: { cookie: "authjs.session-token=abc", authorization: "Bearer xyz" },
      cookies: { "authjs.session-token": "abc" },
      query_string: "file=src/secret.ts",
    },
    user: { id: "u1", email: "dev@example.com", ip_address: "203.0.113.9" },
    extra: { requestBodyValues: { prompt: USER_CODE } },
    contexts: {
      runtime: { name: "node" },
      // Error properties copied by the SDK (e.g. the AI SDK's prompt).
      APICallError: { requestBodyValues: { prompt: USER_CODE } },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "Groq said: invalid key gsk_abcdefghijklmnopqrstuvwxyz",
          stacktrace: { frames: [{ filename: "app.js", vars: { content: USER_CODE } }] },
        },
      ],
    },
    breadcrumbs: [
      { category: "console", message: USER_CODE },
      { category: "fetch", data: { url: "https://app.example/r/tok_123?x=1", method: "GET", status_code: 200, body: USER_CODE } },
    ],
  };
}

describe("scrubEvent", () => {
  const scrubbed = scrubEvent(errorEvent());
  const json = JSON.stringify(scrubbed);

  it("keeps none of the user's code, PII, cookies or credentials", () => {
    for (const leak of [USER_CODE, "hunter2", "abc", "xyz", "dev@example.com", "203.0.113.9", "src/secret.ts", "tok_123", "gsk_abc"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("keeps what is needed to debug: method, path, error type, safe contexts", () => {
    expect(scrubbed.request).toEqual({ method: "POST", url: "https://app.example/api/explorer/file" });
    expect(scrubbed.exception?.values?.[0]).toMatchObject({ type: "Error", value: "Groq said: invalid key [REDACTED]" });
    expect(scrubbed.contexts).toEqual({ runtime: { name: "node" } });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "https://app.example/r/[REDACTED]", method: "GET", status_code: 200 } },
    ]);
  });
});

describe("scrubUrl", () => {
  it("drops the query and hash and hides share tokens", () => {
    expect(scrubUrl("/r/abc123?utm=x")).toBe("/r/[REDACTED]");
    expect(scrubUrl("/projects/p1/explorer?file=a.ts#L1")).toBe("/projects/p1/explorer");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
  });
});

describe("sentryOptions", () => {
  it("is off without a DSN and defaults to the development environment", () => {
    expect(sentryOptions("", "production").dsn).toBeUndefined();
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1", undefined).environment).toBe("development");
  });
});

describe("tracesSamplerFor", () => {
  const sample = (environment: string | undefined, name: string, attributes = {}) =>
    tracesSamplerFor(environment)({
      name,
      attributes,
      inheritOrSampleWith: (fallback) => fallback,
    });

  it("traces every request of the measured routes, in any environment", () => {
    expect(sample("production", "POST /api/chat")).toBe(1);
    expect(sample("production", "POST /api/explorer/explain")).toBe(1);
    expect(sample("production", "POST", { "http.target": "/api/projects/abc-123/analyze" })).toBe(1);
  });

  it("samples everything else at 10% in production and fully elsewhere", () => {
    expect(sample("production", "GET /api/projects/abc-123/status")).toBe(0.1);
    expect(sample("production", "GET /login")).toBe(0.1);
    expect(sample("production", "POST /api/chatty")).toBe(0.1);
    expect(sample("preview", "GET /login")).toBe(1);
  });
});

describe("dataCollection (SDK defaults collect everything)", () => {
  it("turns off every category that could carry PII, prompts or the user's code", () => {
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1", "production").dataCollection).toEqual({
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
    });
  });
});

describe("scrubSpan (traces are streamed, beforeSendTransaction never runs)", () => {
  // Shape seen in production on 2026-10-01: url.full carried the share token.
  const span = {
    trace_id: "t",
    span_id: "s",
    name: "GET /r/tok_live_123",
    start_timestamp: 1,
    status: "ok" as const,
    is_segment: true,
    attributes: {
      "url.full": "https://nextjs-codedriven.vercel.app/r/tok_live_123?x=segredo",
      "http.target": "/r/tok_live_123?x=segredo",
      "url.query": "x=segredo",
      "http.request.header.cookie": "authjs.session-token=abc",
      "client.address": "203.0.113.9",
      "user.email": "dev@example.com",
      "db.statement": "connect postgres://app:hunter2@db.internal/app",
      "http.route": "/r/[token]",
      "http.response.status_code": 404,
      "sentry.op": "http.server",
    },
  };
  const scrubbed = scrubSpan(span);

  it("keeps no share token, query, cookie, IP, email or credential", () => {
    const json = JSON.stringify(scrubbed);
    for (const leak of ["tok_live_123", "segredo", "abc", "203.0.113.9", "dev@example.com", "hunter2"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("keeps the route, status and operation", () => {
    expect(scrubbed.name).toBe("GET /r/[REDACTED]");
    expect(scrubbed.attributes).toMatchObject({
      "url.full": "https://nextjs-codedriven.vercel.app/r/[REDACTED]",
      "http.response.status_code": 404,
      "sentry.op": "http.server",
    });
  });

  it("is the span hook of the options", () => {
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1", "production").beforeSendSpan).toBe(scrubSpan);
  });
});

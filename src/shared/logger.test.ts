import { afterEach, describe, expect, it, vi } from "vitest";

import { logger, redactText, requestIdFrom, setErrorReporter } from "@/shared/logger";

function captureLines(method: "error" | "warn" | "log") {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  return () => spy.mock.calls.map((call) => JSON.parse(String(call[0])));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("writes one JSON line with level, event, time and fields", () => {
    const lines = captureLines("log");
    logger.info("project.created", { requestId: "req-1", projectId: "p1" });

    expect(lines()).toEqual([
      expect.objectContaining({
        level: "info",
        event: "project.created",
        requestId: "req-1",
        projectId: "p1",
        time: expect.any(String),
      }),
    ]);
  });

  it("keeps the real error (name, message, stack) instead of dropping it", () => {
    const lines = captureLines("error");
    logger.error("chat.failed", { err: new TypeError("boom") });

    const [entry] = lines();
    expect(entry.error).toMatchObject({ name: "TypeError", message: "boom" });
    expect(entry.error.stack).toContain("TypeError: boom");
  });

  it("includes the error cause", () => {
    const lines = captureLines("error");
    logger.error("analysis.failed", {
      err: new Error("outer", { cause: new Error("inner") }),
    });
    expect(lines()[0].error.cause).toMatchObject({ message: "inner" });
  });

  it("redacts sensitive field names at any depth", () => {
    const lines = captureLines("warn");
    logger.warn("config", {
      password: "p",
      nested: { apiKey: "k", accessToken: "t", DATABASE_URL: "u", plain: "ok" },
    });

    const [entry] = lines();
    expect(entry.password).toBe("[REDACTED]");
    expect(entry.nested).toEqual({
      apiKey: "[REDACTED]",
      accessToken: "[REDACTED]",
      DATABASE_URL: "[REDACTED]",
      plain: "ok",
    });
  });

  it("redacts credentials inside error messages and stacks", () => {
    const lines = captureLines("error");
    logger.error("db.failed", {
      err: new Error(
        "connect failed postgresql://app:hunter2@db.internal:5432/app with sk_live_abc123 and ghp_0123456789abcdefghij0123",
      ),
    });

    const text = JSON.stringify(lines()[0]);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("sk_live_abc123");
    expect(text).not.toContain("ghp_0123456789abcdefghij0123");
    expect(text).toContain("postgresql://[REDACTED]@db.internal");
  });

  it("survives circular structures", () => {
    const lines = captureLines("log");
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;

    logger.info("weird", { loop });
    expect(lines()[0].loop).toEqual({ name: "loop", self: "[Circular]" });
  });
});

describe("redactText", () => {
  it.each([
    ["Bearer eyJhbGciOi.payload.sig", "Bearer [REDACTED]"],
    ["whsec_abc123", "[REDACTED]"],
    ["key gsk_0123456789abcdefghijABCD", "key [REDACTED]"],
    ["postgres://u:p@host/db", "postgres://[REDACTED]@host/db"],
  ])("redacts %s", (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it("truncates very long text", () => {
    expect(redactText("a".repeat(5000)).length).toBeLessThanOrEqual(2001);
  });
});

describe("requestIdFrom", () => {
  it("prefers Vercel's request id so logs match the request log", () => {
    expect(requestIdFrom(new Headers({ "x-vercel-id": "gru1::abc" }))).toBe("gru1::abc");
  });

  it("falls back to a new id", () => {
    expect(requestIdFrom(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("error reporter (Sentry)", () => {
  afterEach(() => {
    setErrorReporter(undefined);
  });

  it("forwards only errors, with the event name and request id", () => {
    captureLines("error");
    captureLines("warn");
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const err = new Error("boom");

    logger.warn("analysis.report_rejected", { err });
    logger.error("chat.failed", { err, requestId: "req-1" });

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith("chat.failed", err, "req-1");
  });

  it("never throws when the reporter fails, and still writes the line", () => {
    const lines = captureLines("error");
    setErrorReporter(() => {
      throw new Error("sentry down");
    });

    expect(() => logger.error("chat.failed")).not.toThrow();
    expect(lines()).toEqual([expect.objectContaining({ event: "chat.failed" })]);
  });
});

describe("error reporter across bundles", () => {
  afterEach(() => {
    setErrorReporter(undefined);
  });

  // Next gives instrumentation.ts and each route their own copy of this
  // module: the reporter set in one copy must reach the others.
  it("reaches logger.error from another copy of the module", async () => {
    captureLines("error");
    const reporter = vi.fn();
    setErrorReporter(reporter);

    vi.resetModules();
    const otherCopy = await import("@/shared/logger");
    expect(otherCopy.logger).not.toBe(logger);

    const err = new Error("boom");
    otherCopy.logger.error("analysis.report_failed", { err });
    expect(reporter).toHaveBeenCalledWith("analysis.report_failed", err, undefined);
  });
});

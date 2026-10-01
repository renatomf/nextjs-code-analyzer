import { describe, expect, it } from "vitest";

import { traced } from "./tracing";

// Sentry is not initialized in tests: the span is a no-op, the work is not.
describe("traced", () => {
  it("returns the work's result", async () => {
    await expect(traced("step", { items: 2 }, async () => 42)).resolves.toBe(42);
  });

  it("propagates the work's error unchanged", async () => {
    const error = new Error("boom");
    await expect(traced("step", {}, () => Promise.reject(error))).rejects.toBe(error);
  });
});

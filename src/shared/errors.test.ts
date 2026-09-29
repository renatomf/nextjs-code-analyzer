import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BillingLimitError } from "@/modules/billing";
import { GitHubError } from "@/lib/github";
import { RateLimitError } from "@/lib/rate-limit";
import { DomainError } from "@/shared/errors";
import { publicErrorMessage } from "@/shared/public-error-message";

vi.mock("@/lib/db", () => ({ db: {} }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publicErrorMessage", () => {
  it("shows a DomainError's own message and does not log it as a failure", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicErrorMessage(new DomainError("No JS files."), "Failed.")).toBe("No JS files.");
    expect(log).not.toHaveBeenCalled();
  });

  it("hides anything else behind the fallback and logs the real cause", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = publicErrorMessage(new Error("connect ECONNREFUSED db:5432"), "Failed.");

    expect(message).toBe("Failed.");
    const entry = JSON.parse(String(log.mock.calls[0][0]));
    expect(entry).toMatchObject({ event: "action.failed", error: { message: "connect ECONNREFUSED db:5432" } });
  });

  it("treats the existing user-facing errors as domain errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors = [
      new RateLimitError("Too many requests."),
      new GitHubError("Repository not found."),
      new BillingLimitError("analyses", "Daily analysis limit reached."),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(DomainError);
      expect(publicErrorMessage(error, "Failed.")).toBe(error.message);
    }
  });
});

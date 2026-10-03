import { describe, expect, it } from "vitest";

import { DomainError } from "@/shared/errors";
import { AnalysisCanceledError } from "@/modules/projects";

import { classifyStepFailure, isFinalAttempt, STEP_MAX_RETRIES } from "./step-failure";

describe("isFinalAttempt", () => {
  it("is final only after the retries are used", () => {
    expect(isFinalAttempt(1)).toBe(false);
    expect(isFinalAttempt(STEP_MAX_RETRIES)).toBe(false);
    expect(isFinalAttempt(STEP_MAX_RETRIES + 1)).toBe(true);
  });
});

describe("classifyStepFailure", () => {
  it("does not retry a user error and keeps its message", () => {
    expect(classifyStepFailure(new DomainError("No JavaScript/TypeScript source files found to analyze."))).toEqual({
      fatal: true,
      message: "No JavaScript/TypeScript source files found to analyze.",
    });
  });

  it("does not retry a canceled run", () => {
    expect(classifyStepFailure(new AnalysisCanceledError())).toEqual({
      fatal: true,
      message: "Analysis canceled.",
    });
  });

  it("retries anything else behind a generic message (step errors are stored with the run)", () => {
    const failure = classifyStepFailure(new Error("connect ECONNREFUSED postgres://app:hunter2@db"));

    expect(failure).toEqual({ fatal: false, message: "Analysis step failed." });
    expect(JSON.stringify(failure)).not.toContain("hunter2");
  });
});

import { describe, expect, it } from "vitest";

import { estimateCostMicroUsd } from "./llm-cost";

describe("estimateCostMicroUsd", () => {
  it("prices input and output tokens at the model's list price", () => {
    // 1M input at $0.15 + 1M output at $0.60 = $0.75.
    expect(estimateCostMicroUsd("openai/gpt-oss-120b", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      750_000,
    );
    // A typical report review: 5,500 in + 1,400 out = $0.001665.
    expect(estimateCostMicroUsd("openai/gpt-oss-120b", { inputTokens: 5_500, outputTokens: 1_400 })).toBe(1_665);
  });

  it("uses each model's own price", () => {
    expect(estimateCostMicroUsd("openai/gpt-oss-20b", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      375_000,
    );
  });

  it("gives no estimate for a model without a known price", () => {
    expect(estimateCostMicroUsd("e2e-fake-model", { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });

  it("is zero for a call without tokens (a failed call)", () => {
    expect(estimateCostMicroUsd("openai/gpt-oss-120b", { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

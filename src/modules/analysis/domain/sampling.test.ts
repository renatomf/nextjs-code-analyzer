import { describe, expect, it } from "vitest";

import { sampleForReview, type ReviewBudget } from "./sampling";

const chunk = (filePath: string, startLine = 1, size = 100) => ({
  filePath,
  startLine,
  content: "x".repeat(size),
});

const files = (sample: Array<{ filePath: string }>) => [...new Set(sample.map((c) => c.filePath))];

const budget = (maxChunks: number, maxChars = 100_000): ReviewBudget => ({
  maxChunks,
  maxChars,
  chunkChars: 2_500,
});

describe("sampleForReview", () => {
  it("reaches files far down the alphabet instead of filling up with the first ones", () => {
    const early = Array.from({ length: 30 }, (_, i) => chunk(`src/components/w${String(i).padStart(2, "0")}.tsx`));
    const sample = sampleForReview([...early, chunk("src/utils/orders.ts")], budget(5));

    expect(files(sample)).toContain("src/utils/orders.ts");
  });

  it("puts server logic before other logic, UI and configuration", () => {
    const sample = sampleForReview(
      [
        chunk("next.config.ts"),
        chunk("src/components/button.tsx"),
        chunk("src/lib/format.ts"),
        chunk("src/server/users.ts"),
      ],
      budget(1),
    );

    // Alphabetical order alone would pick src/lib/format.ts.
    expect(files(sample)).toEqual(["src/server/users.ts"]);
    expect(files(sampleForReview([chunk("next.config.ts"), chunk("src/components/button.tsx"), chunk("src/lib/format.ts")], budget(1)))).toEqual(["src/lib/format.ts"]);
    expect(files(sampleForReview([chunk("next.config.ts"), chunk("src/components/button.tsx")], budget(1)))).toEqual(["src/components/button.tsx"]);
    // Type declarations hold no logic, whatever their name says.
    expect(files(sampleForReview([chunk("src/types/next-auth.d.ts"), chunk("src/components/button.tsx")], budget(1)))).toEqual(["src/components/button.tsx"]);
  });

  it("takes one file per directory in turn", () => {
    const sample = sampleForReview(
      [chunk("src/a/one.ts"), chunk("src/a/two.ts"), chunk("src/a/three.ts"), chunk("src/b/one.ts")],
      budget(2),
    );

    expect(files(sample)).toEqual(["src/a/one.ts", "src/b/one.ts"]);
  });

  it("takes the first chunk of every file before the second of any", () => {
    const sample = sampleForReview(
      [chunk("src/a.ts", 1), chunk("src/a.ts", 50), chunk("src/b.ts", 1)],
      budget(2),
    );

    expect(sample.map((c) => `${c.filePath}:${c.startLine}`)).toEqual(["src/a.ts:1", "src/b.ts:1"]);
  });

  it("leaves tests out, unless there is nothing else", () => {
    expect(files(sampleForReview([chunk("src/a.test.ts"), chunk("e2e/flow.spec.ts"), chunk("src/a.ts")], budget(5)))).toEqual(["src/a.ts"]);
    expect(files(sampleForReview([chunk("src/a.test.ts")], budget(5)))).toEqual(["src/a.test.ts"]);
  });

  it("stays within the character budget, skipping chunks that do not fit", () => {
    const sample = sampleForReview(
      [chunk("src/api/a.ts", 1, 900), chunk("src/lib/b.ts", 1, 300), chunk("src/lib/c.ts", 1, 100)],
      budget(10, 1_000),
    );

    expect(files(sample)).toEqual(["src/api/a.ts", "src/lib/c.ts"]);
  });

  it("counts a long chunk only up to the part that is sent", () => {
    const sample = sampleForReview([chunk("src/a.ts", 1, 10_000), chunk("src/b.ts", 1, 10_000)], budget(10, 5_000));

    expect(sample).toHaveLength(2);
  });

  it("returns the sample in path and line order, the same every time", () => {
    const input = [chunk("src/z/api.ts", 1), chunk("src/a/lib.ts", 9), chunk("src/a/lib.ts", 1)];
    const first = sampleForReview(input, budget(10));

    expect(first.map((c) => `${c.filePath}:${c.startLine}`)).toEqual(["src/a/lib.ts:1", "src/a/lib.ts:9", "src/z/api.ts:1"]);
    expect(sampleForReview([...input].reverse(), budget(10))).toEqual(first);
  });

  it("returns nothing for no chunks", () => {
    expect(sampleForReview([], budget(5))).toEqual([]);
  });
});

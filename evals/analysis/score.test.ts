import { describe, expect, it } from "vitest";

import type { Finding } from "@/modules/analysis";

import { scoreCase } from "./score";

const finding = (title: string, filePath: string | null, category: Finding["category"] = "testing"): Finding => ({
  title,
  description: "d",
  severity: "high",
  category,
  filePath,
});

describe("scoreCase", () => {
  const expected = [
    { category: "testing" as const, filePath: "src/a.ts", title: /^Critical area/ },
    { category: "testing" as const, filePath: "src/b.ts", title: /^Critical area/ },
  ];

  it("counts matches, false positives and misses", () => {
    const score = scoreCase(
      [finding("Critical area may lack tests", "src/a.ts"), finding("Large file (900 lines)", "src/c.ts", "codeQuality")],
      expected,
    );

    expect(score.truePositives).toBe(1);
    expect(score.falsePositives.map((f) => f.filePath)).toEqual(["src/c.ts"]);
    expect(score.missed.map((e) => e.filePath)).toEqual(["src/b.ts"]);
    expect(score.precision).toBe(0.5);
    expect(score.recall).toBe(0.5);
  });

  it("matches each expectation once: a repeated finding is a false positive", () => {
    const score = scoreCase(
      [finding("Critical area may lack tests", "src/a.ts"), finding("Critical area may lack tests", "src/a.ts")],
      [expected[0]],
    );

    expect(score.truePositives).toBe(1);
    expect(score.falsePositives).toHaveLength(1);
  });

  it("needs the same category, file and title", () => {
    const score = scoreCase([finding("Critical area may lack tests", "src/a.ts", "security")], [expected[0]]);

    expect(score.truePositives).toBe(0);
  });

  it("counts each occurrence of a grouped finding", () => {
    const grouped: Finding = {
      ...finding("Critical areas may lack tests (2)", "src/a.ts"),
      occurrences: [
        { filePath: "src/a.ts", severity: "high", title: "Critical area may lack tests", description: "d" },
        { filePath: "src/b.ts", severity: "high", title: "Critical area may lack tests", description: "d" },
      ],
    };

    expect(scoreCase([grouped], expected)).toMatchObject({ truePositives: 2, precision: 1, recall: 1 });
  });

  it("scores 1 when nothing is expected and nothing is found", () => {
    expect(scoreCase([], [])).toMatchObject({ precision: 1, recall: 1 });
  });
});

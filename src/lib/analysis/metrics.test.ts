import { computeDeterministicMetrics } from "@/lib/analysis/metrics";
import { describe, expect, it } from "vitest";

describe("computeDeterministicMetrics", () => {
  it("detects hardcoded secrets", () => {
    const metrics = computeDeterministicMetrics([
      {
        relativePath: "src/config.ts",
        content: ` const apiKey = "example-not-a-real-key-value";\n`,
      },
    ]);

    expect(metrics.secretHits.length).toBeGreaterThan(0);
    expect(metrics.issues.some((i) => i.category === "security")).toBe(true);
  });

  it("flags large files", () => {
    const content = Array.from(
      { length: 450 },
      (_, i) => `const x${i} = ${i};`,
    ).join("\n");
    const metrics = computeDeterministicMetrics([
      { relativePath: "src/huge.ts", content },
    ]);

    expect(metrics.largeFiles).toHaveLength(1);
    expect(metrics.largeFiles[0]?.filePath).toBe("src/huge.ts");
  });

  it("computes approximate test coverage signal", () => {
    const metrics = computeDeterministicMetrics([
      {
        relativePath: "src/auth.ts",
        content: "export const login = () => {};\n",
      },
      {
        relativePath: "src/auth.test.ts",
        content: "test('login', () => {});\n",
      },
      { relativePath: "src/other.ts", content: "export const x = 1;\n" },
    ]);

    expect(metrics.testFileCount).toBe(1);
    expect(metrics.sourceFileCount).toBe(2);
    expect(metrics.testedSourceApproxPercent).toBe(50);
  });

  it("flags untested critical paths", () => {
    const metrics = computeDeterministicMetrics([
      {
        relativePath: "src/lib/payment.ts",
        content: "export function charge() {}\n",
      },
    ]);

    expect(metrics.untestedCriticalPaths).toContain("src/lib/payment.ts");
    expect(
      metrics.issues.some(
        (i) => i.category === "testing" && i.filePath === "src/lib/payment.ts",
      ),
    ).toBe(true);
  });
});

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

  // TD-31 regression. The start regex treated any `const x = (` as a
  // function, so a parenthesized expression was reported as a "complex
  // function" running until the braces of the following code closed (262
  // lines on this repo's report page), and the scan jumped over the real
  // long function that follows (`render` below).
  it("does not report a parenthesized const expression as a function", () => {
    const body = Array.from({ length: 90 }, (_, i) => `  const v${i} = ${i};`);
    const content = [
      "const scores = (defaults ??",
      "  null) as Scores | null;",
      "",
      "export function render() {",
      ...body,
      "}",
    ].join("\n");

    const metrics = computeDeterministicMetrics([
      { relativePath: "src/app/page.tsx", content },
    ]);

    expect(metrics.complexFunctions.map((fn) => fn.name)).not.toContain("scores");
    expect(metrics.complexFunctions.map((fn) => fn.name)).toContain("render");
  });

  it("still reports a long arrow function, even with parameters over several lines", () => {
    const body = Array.from({ length: 90 }, (_, i) => `  const v${i} = ${i};`);
    const content = ["export const handler = async (", "  req: Request,", ") => {", ...body, "};"].join(
      "\n",
    );

    const metrics = computeDeterministicMetrics([{ relativePath: "src/api.ts", content }]);

    expect(metrics.complexFunctions.map((fn) => fn.name)).toEqual(["handler"]);
  });

  it("treats test/ and tests/ folders, at the root or nested, as tests", () => {
    const metrics = computeDeterministicMetrics([
      { relativePath: "src/test/helpers.ts", content: "export const h = 1;\n" },
      { relativePath: "test/setup.ts", content: "export const s = 1;\n" },
      { relativePath: "src/tests/a.ts", content: "export const a = 1;\n" },
      { relativePath: "src/app.ts", content: "export const app = 1;\n" },
    ]);

    expect(metrics.testFileCount).toBe(3);
    expect(metrics.sourceFileCount).toBe(1);
  });

  it("does not flag fake secrets in fixtures and mocks", () => {
    const fake = ["password", " = ", '"', "fixture-value-123", '"'].join("");
    const metrics = computeDeterministicMetrics([
      { relativePath: "src/lib/__fixtures__/creds.ts", content: `${fake}\n` },
      { relativePath: "e2e/fixtures/user.ts", content: `${fake}\n` },
      { relativePath: "src/__mocks__/db.ts", content: `${fake}\n` },
      { relativePath: "src/config.ts", content: `${fake}\n` },
    ]);

    expect(metrics.secretHits.map((hit) => hit.filePath)).toEqual(["src/config.ts"]);
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

import type { ReportIssue } from "@/lib/analysis/report-types";
import path from "path";

export type SourceFile = {
  relativePath: string;
  content: string;
};

export type DeterministicMetrics = {
  largeFiles: Array<{ filePath: string; lines: number }>;
  complexFunctions: Array<{ filePath: string; name: string; lines: number }>;
  testFileCount: number;
  sourceFileCount: number;
  testedSourceApproxPercent: number;
  untestedCriticalPaths: string[];
  secretHits: Array<{ filePath: string; line: number; hint: string }>;
  issues: ReportIssue[];
  summaries: {
    codeQuality: string;
    testing: string;
    security: string;
  };
};

const LARGE_FILE_LINES = 400;
const COMPLEX_FUNCTION_LINES = 80;

const SECRET_PATTERNS: Array<{ hint: string; regex: RegExp }> = [
  {
    hint: "Hardcoded API key / token assignment",
    regex:
      /\b(api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    hint: "JWT-like secret literal",
    regex: /\bjwt[_-]?secret\b\s*[:=]\s*['"][^'"]+['"]/i,
  },
  {
    hint: "AWS-style access key pattern",
    regex: /AKIA[0-9A-Z]{16}/,
  },
];

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    filePath.includes("__tests__/") ||
    filePath.includes("/tests/") ||
    filePath.startsWith("tests/")
  );
}

function stripExt(filePath: string): string {
  return filePath.replace(/\.(jsx?|tsx?)$/i, "");
}

function guessSourceFromTest(testPath: string): string {
  return stripExt(testPath)
    .replace(/\.test$/i, "")
    .replace(/\.spec$/i, "")
    .replace(/\/__tests__\//, "/")
    .replace(/\/tests\//, "/");
}

function findComplexFunctions(
  filePath: string,
  content: string,
): Array<{ name: string; lines: number }> {
  const results: Array<{ name: string; lines: number }> = [];
  const lines = content.split("\n");

  const startRegex =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/;

  let i = 0;
  while (i < lines.length) {
    const match = lines[i]?.match(startRegex);
    if (!match) {
      i += 1;
      continue;
    }

    const name = match[1] || match[2] || "anonymous";
    let depth = 0;
    let started = false;
    let j = i;

    for (; j < lines.length; j += 1) {
      const line = lines[j] ?? "";
      for (const char of line) {
        if (char === "{") {
          depth += 1;
          started = true;
        } else if (char === "}") {
          depth -= 1;
        }
      }
      if (started && depth <= 0) break;
    }

    const fnLines = j - i + 1;
    if (fnLines >= COMPLEX_FUNCTION_LINES) {
      results.push({ name, lines: fnLines });
    }
    i = Math.max(i + 1, j);
  }

  return results;
}

/** Compute code-quality, testing, and simple security signals without an LLM. */
export function computeDeterministicMetrics(
  files: SourceFile[],
): DeterministicMetrics {
  const sourceFiles = files.filter((file) => !isTestFile(file.relativePath));
  const testFiles = files.filter((file) => isTestFile(file.relativePath));

  const largeFiles = sourceFiles
    .map((file) => ({
      filePath: file.relativePath,
      lines: file.content.split("\n").length,
    }))
    .filter((file) => file.lines >= LARGE_FILE_LINES)
    .sort((a, b) => b.lines - a.lines);

  const complexFunctions: DeterministicMetrics["complexFunctions"] = [];
  for (const file of sourceFiles) {
    for (const fn of findComplexFunctions(file.relativePath, file.content)) {
      complexFunctions.push({
        filePath: file.relativePath,
        name: fn.name,
        lines: fn.lines,
      });
    }
  }

  const testedBases = new Set(
    testFiles.map((file) => guessSourceFromTest(file.relativePath)),
  );
  let matchedSources = 0;
  for (const file of sourceFiles) {
    const base = stripExt(file.relativePath);
    if (
      [...testedBases].some(
        (tested) => tested.endsWith(base) || base.endsWith(tested),
      )
    ) {
      matchedSources += 1;
    }
  }

  const testedSourceApproxPercent =
    sourceFiles.length === 0
      ? 0
      : Math.round((matchedSources / sourceFiles.length) * 100);

  const criticalKeywords = ["auth", "payment", "billing", "password", "token"];
  const untestedCriticalPaths = sourceFiles
    .filter((file) => {
      const lower = file.relativePath.toLowerCase();
      const looksCritical = criticalKeywords.some((keyword) =>
        lower.includes(keyword),
      );
      if (!looksCritical) return false;
      const base = stripExt(file.relativePath);
      return ![...testedBases].some(
        (tested) => tested.endsWith(base) || base.endsWith(tested),
      );
    })
    .map((file) => file.relativePath)
    .slice(0, 12);

  const secretHits: DeterministicMetrics["secretHits"] = [];
  for (const file of sourceFiles) {
    const lines = file.content.split("\n");
    lines.forEach((line, index) => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          secretHits.push({
            filePath: file.relativePath,
            line: index + 1,
            hint: pattern.hint,
          });
          break;
        }
      }
    });
  }

  const issues: ReportIssue[] = [];

  for (const file of largeFiles.slice(0, 10)) {
    issues.push({
      title: `Large file (${file.lines} lines)`,
      description: `This file is unusually large and may be harder to maintain. Consider splitting responsibilities.`,
      severity: file.lines >= 800 ? "high" : "medium",
      category: "codeQuality",
      filePath: file.filePath,
    });
  }

  for (const fn of complexFunctions.slice(0, 12)) {
    issues.push({
      title: `Complex function ${fn.name} (${fn.lines} lines)`,
      description: `Function appears long and may have high complexity. Consider extracting helpers.`,
      severity: fn.lines >= 150 ? "high" : "medium",
      category: "codeQuality",
      filePath: fn.filePath,
    });
  }

  if (testedSourceApproxPercent < 40) {
    issues.push({
      title: "Low test file coverage signal",
      description: `Only about ${testedSourceApproxPercent}% of source files appear to have nearby test files. This is a file-matching proxy, not runtime coverage.`,
      severity: testedSourceApproxPercent < 15 ? "high" : "medium",
      category: "testing",
      filePath: null,
    });
  }

  for (const filePath of untestedCriticalPaths.slice(0, 8)) {
    issues.push({
      title: "Critical area may lack tests",
      description: `No nearby test file was found for a path that looks security/payment related.`,
      severity: "high",
      category: "testing",
      filePath,
    });
  }

  for (const hit of secretHits.slice(0, 10)) {
    issues.push({
      title: "Potential hardcoded secret",
      description: `${hit.hint} around line ${hit.line}. Treat as a potential issue to review, not a confirmed vulnerability.`,
      severity: "critical",
      category: "security",
      filePath: hit.filePath,
    });
  }

  return {
    largeFiles,
    complexFunctions,
    testFileCount: testFiles.length,
    sourceFileCount: sourceFiles.length,
    testedSourceApproxPercent,
    untestedCriticalPaths,
    secretHits,
    issues,
    summaries: {
      codeQuality: `Found ${largeFiles.length} large file(s) and ${complexFunctions.length} complex function(s) using static heuristics.`,
      testing: `Matched test files for roughly ${testedSourceApproxPercent}% of source files (${testFiles.length} test files found).`,
      security: `Pattern scan found ${secretHits.length} potential hardcoded secret hit(s).`,
    },
  };
}

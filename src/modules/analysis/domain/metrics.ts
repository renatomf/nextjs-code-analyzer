import type { Finding } from "./finding";
import { DETERMINISTIC_RULES, type ProjectMeasures } from "./rules";

// Pure (no Node APIs): the module's public API is also imported by the UI.

export type SourceFile = {
  relativePath: string;
  content: string;
};

export type DeterministicMetrics = ProjectMeasures & {
  issues: Finding[];
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
      // No whitespace in the value: credentials are single tokens; UI copy
      // such as `token: "Paste your access token"` is prose.
      /\b(api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
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

/** Last path segment; stored paths always use "/". */
function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

function isTestFile(filePath: string): boolean {
  const base = basename(filePath).toLowerCase();
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    filePath.includes("__tests__/") ||
    // `test/` and `tests/` folders, at the root or nested (`src/test/`).
    /(^|\/)tests?\//.test(filePath)
  );
}

/** Test data (fixtures, mocks): fake secrets there are expected. */
function isTestSupportFile(filePath: string): boolean {
  return /(^|\/)(__fixtures__|fixtures|__mocks__)\//.test(filePath);
}

function stripExt(filePath: string): string {
  return filePath.replace(/\.(jsx?|tsx?)$/i, "");
}

function guessSourceFromTest(testPath: string): string {
  return stripExt(testPath)
    .replace(/\.test$/i, "")
    .replace(/\.spec$/i, "")
    .replace(/\/__tests__\//, "/")
    .replace(/\/tests?\//, "/");
}

const ARROW_LOOKAHEAD_LINES = 20;

function isArrowFunctionStart(lines: string[], start: number): boolean {
  const text = lines.slice(start, start + ARROW_LOOKAHEAD_LINES).join("\n");
  const arrow = text.indexOf("=>");
  const semicolon = text.indexOf(";");
  return arrow !== -1 && (semicolon === -1 || arrow < semicolon);
}

/** A React component: PascalCase function in a .jsx/.tsx file. */
function isComponent(filePath: string, name: string): boolean {
  return /\.[jt]sx$/i.test(filePath) && /^[A-Z]/.test(name);
}

/**
 * A component is sized by its logic (hooks, handlers) up to its last JSX
 * `return`, not by its markup: 100 lines of JSX are not complexity.
 */
function componentLogicLines(lines: string[], start: number, end: number): number {
  for (let k = end; k > start; k -= 1) {
    if (/^\s*return\s*[(<]/.test(lines[k] ?? "")) return k - start + 1;
  }
  return end - start + 1;
}

/** Words of a path: `src/lib/oauthIcons.tsx` → src, lib, oauth, icons, tsx. */
function pathWords(filePath: string): string[] {
  return filePath
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[/._\-\s]+/)
    .filter(Boolean);
}

// `from "x"`, `import "x"`, `import("x")`, `require("x")` (not vi.mock strings).
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/**
 * Source path (without extension) a test imports, or null for packages.
 * Resolves relative imports and the `@/` alias (`src/`, the Next.js default).
 */
function resolveImport(testPath: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return stripExt(`src/${specifier.slice(2)}`);
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const parts = testPath.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return stripExt(parts.join("/"));
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

    // `const x = (` is only a function when `=>` comes before the first `;`
    // (not `const x = (a ?? b) as T;`, TD-31).
    if (match[2] && !isArrowFunctionStart(lines, i)) {
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

    const fnLines = isComponent(filePath, name)
      ? componentLogicLines(lines, i, j)
      : j - i + 1;
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
  // Files a test imports count as tested too (tests often live apart).
  const importedByTests = new Set<string>();
  for (const test of testFiles) {
    for (const [, specifier] of test.content.matchAll(IMPORT_SPECIFIER)) {
      const resolved = resolveImport(test.relativePath, specifier);
      if (resolved) importedByTests.add(resolved.replace(/\/index$/, ""));
    }
  }
  const isTested = (filePath: string) => {
    const base = stripExt(filePath);
    return (
      importedByTests.has(base) ||
      importedByTests.has(base.replace(/\/index$/, "")) ||
      [...testedBases].some((tested) => tested.endsWith(base) || base.endsWith(tested))
    );
  };

  const matchedSources = sourceFiles.filter((file) => isTested(file.relativePath)).length;

  const testedSourceApproxPercent =
    sourceFiles.length === 0
      ? 0
      : Math.round((matchedSources / sourceFiles.length) * 100);

  // Security/payment logic (not screens: .jsx/.tsx components render, the
  // checks run in .ts/.js), matched on whole words of the path, so
  // `oauth-icons.ts` is not an "auth" area.
  const criticalKeywords = ["auth", "payment", "billing", "password", "token"];
  const untestedCriticalPaths = sourceFiles
    .filter((file) => {
      if (/\.[jt]sx$/i.test(file.relativePath)) return false;
      const words = pathWords(file.relativePath);
      const looksCritical = criticalKeywords.some(
        (keyword) => words.includes(keyword) || words.includes(`${keyword}s`),
      );
      return looksCritical && !isTested(file.relativePath);
    })
    .map((file) => file.relativePath)
    .slice(0, 12);

  const secretHits: DeterministicMetrics["secretHits"] = [];
  for (const file of sourceFiles) {
    if (isTestSupportFile(file.relativePath)) continue;
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

  const measures: ProjectMeasures = {
    largeFiles,
    complexFunctions,
    testFileCount: testFiles.length,
    sourceFileCount: sourceFiles.length,
    testedSourceApproxPercent,
    untestedCriticalPaths,
    secretHits,
  };
  const issues = DETERMINISTIC_RULES.flatMap((rule) =>
    rule.findings(measures).map((finding) => ({ ...finding, rule: rule.id })),
  );

  return {
    ...measures,
    issues,
    summaries: {
      codeQuality: `Found ${largeFiles.length} large file(s) and ${complexFunctions.length} complex function(s) using static heuristics.`,
      testing: `Matched test files for roughly ${testedSourceApproxPercent}% of source files (${testFiles.length} test files found).`,
      security: `Pattern scan found ${secretHits.length} potential hardcoded secret hit(s).`,
    },
  };
}

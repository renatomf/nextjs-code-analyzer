import type { Finding, IssueSeverity } from "./finding";

/** A code chunk the reviewer received. */
export type ReviewedChunk = {
  filePath: string;
  content: string;
  startLine: number | null;
};

/** What the LLM returns for one issue, before verification. */
export type ClaimedIssue = Omit<Finding, "evidence" | "occurrences" | "rule"> & {
  /** Verbatim code the issue is about. */
  quote?: string | null;
};

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** "null", "" and whitespace mean "no file" (models return them as text). */
function normalizeFilePath(filePath: string | null | undefined): string | null {
  const trimmed = filePath?.trim();
  return !trimmed || trimmed.toLowerCase() === "null" ? null : trimmed;
}

const PROJECT_WIDE_MAX: IssueSeverity = "medium";
const RANK: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Evidence or out (ADR-010's companion, Phase 7 item 5): an issue about a
 * file is kept only when its quote is found, verbatim (ignoring whitespace),
 * in a chunk of that file the reviewer received; its lines are then known.
 * Issues about the whole project (no file) are kept, at most "medium".
 * Deterministic: no second model judges the first.
 */
export function verifyEvidence(
  issues: ClaimedIssue[],
  chunks: ReviewedChunk[],
): { findings: Finding[]; dropped: ClaimedIssue[] } {
  const findings: Finding[] = [];
  const dropped: ClaimedIssue[] = [];

  for (const issue of issues) {
    const { quote, ...rest } = issue;
    const filePath = normalizeFilePath(issue.filePath);

    if (!filePath) {
      const severity = RANK[issue.severity] < RANK[PROJECT_WIDE_MAX] ? PROJECT_WIDE_MAX : issue.severity;
      findings.push({ ...rest, filePath: null, severity });
      continue;
    }

    const wanted = quote ? collapse(quote) : "";
    const chunk = wanted
      ? chunks.find((c) => c.filePath === filePath && collapse(c.content).includes(wanted))
      : undefined;
    if (!chunk) {
      dropped.push(issue);
      continue;
    }

    findings.push({ ...rest, filePath, evidence: locate(chunk, quote!) });
  }

  return { findings, dropped };
}

/** Lines of the quote inside its chunk, from the line where it starts. */
function locate(chunk: ReviewedChunk, quote: string): NonNullable<Finding["evidence"]> {
  const quoteLines = quote.trim().split("\n");
  const target = collapse(quoteLines[0]);
  const index = chunk.content.split("\n").findIndex((line) => {
    const text = collapse(line);
    return text.length > 0 && (text.includes(target) || target.includes(text));
  });
  const startLine = (chunk.startLine ?? 1) + Math.max(index, 0);
  return {
    startLine,
    endLine: startLine + quoteLines.length - 1,
    snippet: quote.trim().slice(0, 500),
  };
}

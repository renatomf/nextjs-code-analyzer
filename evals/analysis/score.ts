import type { Finding } from "@/modules/analysis";

import type { ExpectedFinding } from "./cases";

export type CaseScore = {
  truePositives: number;
  falsePositives: Finding[];
  missed: ExpectedFinding[];
  precision: number;
  recall: number;
};

const matches = (finding: Finding, expected: ExpectedFinding) =>
  finding.category === expected.category &&
  finding.filePath === expected.filePath &&
  expected.title.test(finding.title);

/**
 * A grouped finding (ADR-010) counts once per occurrence, so precision and
 * recall stay comparable with ungrouped results.
 */
export function expandOccurrences(findings: Finding[]): Finding[] {
  return findings.flatMap((finding) =>
    finding.occurrences?.length
      ? finding.occurrences.map((occurrence) => ({
          ...finding,
          ...occurrence,
          occurrences: undefined,
        }))
      : [finding],
  );
}

/**
 * Each expected finding can be matched once. Unmatched findings are false
 * positives (the cases are fully annotated). An empty expectation with no
 * findings scores 1 on both.
 */
export function scoreCase(findings: Finding[], expected: ExpectedFinding[]): CaseScore {
  const remaining = [...expected];
  const falsePositives: Finding[] = [];
  let truePositives = 0;

  for (const finding of expandOccurrences(findings)) {
    const index = remaining.findIndex((candidate) => matches(finding, candidate));
    if (index === -1) {
      falsePositives.push(finding);
    } else {
      remaining.splice(index, 1);
      truePositives += 1;
    }
  }

  const ratio = (part: number, whole: number) => (whole === 0 ? 1 : part / whole);
  return {
    truePositives,
    falsePositives,
    missed: remaining,
    precision: ratio(truePositives, truePositives + falsePositives.length),
    recall: ratio(truePositives, expected.length),
  };
}

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import {
  buildReportFindings,
  computeDeterministicMetrics,
  diminishingPenaltyPolicy,
  linearPenaltyPolicy,
} from "@/modules/analysis";

import { ANALYSIS_CASES } from "./cases";
import { scoreCase } from "./score";

// Deterministic analysis eval (no LLM, no cost): the annotated cases give
// precision and recall; this repository, read exactly like a GitHub import
// (the committed tree through the real extractor), gives the findings and
// the deterministic scores to follow over time. `npm run eval` writes the
// result to evals/results/<date>-<commit>.json.

const git = (...args: string[]) => execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });

async function thisRepository() {
  const extracted = await extractFromZipBuffer(git("archive", "--format=zip", "HEAD"));
  if (!extracted.ok) throw new Error(`Could not read this repository: ${extracted.error}`);
  // Same filter as the analysis (loadProjectSourceFiles).
  const files = extracted.sourceFiles
    .filter((file) => isSourceFile(file.relativePath))
    .map(({ relativePath, content }) => ({ relativePath, content }));

  const metrics = computeDeterministicMetrics(files);
  // As the report shows them: grouped (ADR-010).
  const findings = buildReportFindings(metrics.issues, []);
  const current = diminishingPenaltyPolicy({ measures: metrics, findings });
  const v1 = linearPenaltyPolicy({ measures: metrics, findings: metrics.issues });
  const byTitle: Record<string, number> = {};
  for (const finding of metrics.issues) {
    const rule = finding.title.replace(/ \(.*\)$/, "").replace(/^Complex function .*/, "Complex function");
    byTitle[rule] = (byTitle[rule] ?? 0) + 1;
  }
  return {
    sourceFiles: files.length,
    findings: metrics.issues.length,
    reportFindings: findings.length,
    findingsByRule: byTitle,
    // Deterministic part only: architecture and performance come from the
    // LLM in the product, so here they stay at their base score. `v1` is the
    // linear policy, kept for comparison.
    deterministicCategoryScores: current.categoryScores,
    deterministicHealthScore: current.healthScore,
    v1DeterministicCategoryScores: v1.categoryScores,
    v1DeterministicHealthScore: v1.healthScore,
    issues: metrics.issues.map(({ title, severity, category, filePath }) => ({
      title,
      severity,
      category,
      filePath,
    })),
  };
}

it("measures the deterministic analysis", async () => {
  const cases = ANALYSIS_CASES.map((evalCase) => {
    const findings = buildReportFindings(computeDeterministicMetrics(evalCase.files).issues, []);
    const score = scoreCase(findings, evalCase.expected);
    return {
      name: evalCase.name,
      expected: evalCase.expected.length,
      found: findings.length,
      truePositives: score.truePositives,
      precision: score.precision,
      recall: score.recall,
      falsePositives: score.falsePositives.map(({ title, filePath }) => ({ title, filePath })),
      missed: score.missed.map(({ title, filePath }) => ({ title: title.source, filePath })),
    };
  });

  const tp = cases.reduce((sum, c) => sum + c.truePositives, 0);
  const fp = cases.reduce((sum, c) => sum + c.falsePositives.length, 0);
  const expected = cases.reduce((sum, c) => sum + c.expected, 0);

  const result = {
    date: new Date().toISOString(),
    commit: git("rev-parse", "--short", "HEAD").toString().trim(),
    // The repository part reads the committed tree, not uncommitted edits.
    analysis: {
      cases,
      totals: {
        truePositives: tp,
        falsePositives: fp,
        missed: expected - tp,
        precision: tp + fp === 0 ? 1 : tp / (tp + fp),
        recall: expected === 0 ? 1 : tp / expected,
      },
      thisRepository: await thisRepository(),
    },
  };

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  // Date + commit: several measurements on the same day never overwrite each other.
  const file = join(dir, `${result.date.slice(0, 10)}-${result.commit}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  console.log(
    [
      `analysis eval @ ${result.commit} → ${file}`,
      ...cases.map(
        (c) =>
          `  ${c.name}: precision ${c.precision.toFixed(2)}, recall ${c.recall.toFixed(2)}, ` +
          `${c.falsePositives.length} false positive(s), ${c.missed.length} missed`,
      ),
      `  total: precision ${result.analysis.totals.precision.toFixed(2)}, recall ${result.analysis.totals.recall.toFixed(2)}`,
      `  this repository: ${result.analysis.thisRepository.findings} findings in ${result.analysis.thisRepository.reportFindings} report lines, deterministic health ${result.analysis.thisRepository.deterministicHealthScore} (v1: ${result.analysis.thisRepository.v1DeterministicHealthScore})`,
    ].join("\n"),
  );

  expect(cases).toHaveLength(ANALYSIS_CASES.length);
}, 120_000);

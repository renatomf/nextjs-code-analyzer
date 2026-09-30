import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { chunkProjectFiles } from "@/lib/analysis/chunking";
import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import {
  buildReportFindings,
  computeDeterministicMetrics,
  diminishingPenaltyPolicy,
  linearPenaltyPolicy,
  REVIEW_BUDGET,
  sampleForReview,
} from "@/modules/analysis";

import { loadRepo, REPO_CASES, type RepoCase } from "../repos/repos";
import { ANALYSIS_CASES } from "./cases";
import { scoreCase } from "./score";

// Deterministic analysis eval (no LLM, no cost): the annotated cases give
// precision and recall; this repository, read exactly like a GitHub import
// (the committed tree through the real extractor), gives the findings and
// the deterministic scores to follow over time. `npm run eval` writes the
// result to evals/results/<date>-<commit>.json.

const git = (...args: string[]) => execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });

/**
 * A real repository with annotated problems, read like a GitHub import:
 * what the deterministic analysis finds and which annotated lines reach the
 * LLM reviewer's sample (the model can only report what it receives).
 */
async function realRepository(repoCase: RepoCase) {
  const files = await loadRepo(repoCase);
  const metrics = computeDeterministicMetrics(files);
  const chunks = chunkProjectFiles(files).sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || (a.startLine ?? 0) - (b.startLine ?? 0),
  );
  const sample = sampleForReview(chunks);
  const byRule: Record<string, number> = {};
  for (const finding of metrics.issues) {
    const rule = finding.title.replace(/ \(.*\)$/, "").replace(/^Complex function .*/, "Complex function");
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
  const expected = repoCase.expected.map((e) => ({
    filePath: e.filePath,
    line: e.line,
    inSample: sample.some(
      (c) => c.filePath === e.filePath && (c.startLine ?? 0) <= e.line && e.line <= (c.endLine ?? 0),
    ),
  }));

  return {
    name: repoCase.name,
    commit: repoCase.commit,
    sourceFiles: files.length,
    chunks: chunks.length,
    findings: metrics.issues.length,
    findingsByRule: byRule,
    reviewSample: {
      chunks: sample.length,
      files: new Set(sample.map((c) => c.filePath)).size,
      filePaths: [...new Set(sample.map((c) => c.filePath))],
    },
    expectedInSample: expected.filter((e) => e.inSample).length,
    expectedTotal: expected.length,
    expected,
    issues: metrics.issues.map(({ title, severity, category, filePath }) => ({
      title,
      severity,
      category,
      filePath,
    })),
  };
}

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
  // What the LLM reviewer would see of this repository (roadmap Phase 7
  // item 2): chunks in the order the report reads them, then the sampler.
  const chunks = chunkProjectFiles(files).sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || (a.startLine ?? 0) - (b.startLine ?? 0),
  );
  const sample = sampleForReview(chunks);
  const sampledFiles = [...new Set(sample.map((chunk) => chunk.filePath))];
  const directory = (filePath: string) => filePath.slice(0, filePath.lastIndexOf("/") + 1);

  return {
    sourceFiles: files.length,
    reviewSample: {
      chunks: sample.length,
      chars: sample.reduce((sum, c) => sum + Math.min(c.content.length, REVIEW_BUDGET.chunkChars), 0),
      files: sampledFiles.length,
      directories: new Set(sampledFiles.map(directory)).size,
      testFiles: sampledFiles.filter((f) => /\.(test|spec)\.|(^|\/)(e2e|tests?|__tests__)\//.test(f)).length,
      filePaths: sampledFiles,
    },
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
      realRepositories: await Promise.all(REPO_CASES.map(realRepository)),
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
      ...result.analysis.realRepositories.map(
        (r) =>
          `  ${r.name}: ${r.sourceFiles} files, ${r.chunks} chunks, ${r.findings} findings; annotated lines in the review sample: ${r.expectedInSample}/${r.expectedTotal}`,
      ),
      `  review sample: ${result.analysis.thisRepository.reviewSample.chunks} chunks from ${result.analysis.thisRepository.reviewSample.files} files in ${result.analysis.thisRepository.reviewSample.directories} directories (${result.analysis.thisRepository.reviewSample.testFiles} test files)`,
    ].join("\n"),
  );

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, markdownSummary(result));

  expect(cases).toHaveLength(ANALYSIS_CASES.length);
  // Quality gate (also in CI): a change may not make the analysis worse.
  expect(result.analysis.totals.precision).toBeGreaterThanOrEqual(GATE.minPrecision);
  expect(result.analysis.totals.recall).toBeGreaterThanOrEqual(GATE.minRecall);
  for (const repo of result.analysis.realRepositories) {
    expect(repo.expectedInSample, `${repo.name}: annotated lines in the review sample`).toBeGreaterThanOrEqual(
      GATE.minExpectedInSample[repo.name] ?? 0,
    );
  }
}, 120_000);

/**
 * Raise these when an improvement is merged, never lower them to make a
 * change pass. Annotated cases: every expected finding, no false positive.
 * Real repositories: annotated lines that reach the LLM review sample.
 */
const GATE = {
  minPrecision: 1,
  minRecall: 1,
  minExpectedInSample: { nodegoat: 5 } as Record<string, number>,
};

type EvalResult = {
  commit: string;
  analysis: {
    cases: Array<{ name: string; precision: number; recall: number; falsePositives: unknown[]; missed: unknown[] }>;
    totals: { precision: number; recall: number };
    thisRepository: {
      findings: number;
      reportFindings: number;
      deterministicHealthScore: number;
      reviewSample: { files: number; directories: number; testFiles: number };
    };
    realRepositories: Array<{ name: string; findings: number; expectedInSample: number; expectedTotal: number }>;
  };
};

/** The GitHub Actions job summary: the numbers of this change, at a glance. */
function markdownSummary(result: EvalResult): string {
  const { cases, totals, thisRepository, realRepositories } = result.analysis;
  const pct = (value: number) => value.toFixed(2);
  return [
    `## Analysis eval @ \`${result.commit}\``,
    "",
    "| Annotated case | Precision | Recall | False positives | Missed |",
    "|---|---|---|---|---|",
    ...cases.map(
      (c) => `| ${c.name} | ${pct(c.precision)} | ${pct(c.recall)} | ${c.falsePositives.length} | ${c.missed.length} |`,
    ),
    `| **Total** | **${pct(totals.precision)}** | **${pct(totals.recall)}** | | |`,
    "",
    "| Repository | Findings | Vulnerable lines in the LLM sample |",
    "|---|---|---|",
    ...realRepositories.map(
      (r) =>
        `| ${r.name} | ${r.findings} | ${r.expectedInSample}/${r.expectedTotal} (gate ≥ ${GATE.minExpectedInSample[r.name] ?? 0}) |`,
    ),
    "",
    `**This repository (dogfooding):** deterministic health ${thisRepository.deterministicHealthScore}, ` +
      `${thisRepository.findings} findings in ${thisRepository.reportFindings} report lines; ` +
      `review sample of ${thisRepository.reviewSample.files} files in ${thisRepository.reviewSample.directories} directories ` +
      `(${thisRepository.reviewSample.testFiles} tests).`,
    "",
    `Gate: precision ≥ ${GATE.minPrecision}, recall ≥ ${GATE.minRecall}. No LLM runs in CI (no cost, no quota).`,
    "",
  ].join("\n");
}

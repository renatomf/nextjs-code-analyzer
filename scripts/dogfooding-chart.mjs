// Dogfooding chart (roadmap Phase 7): this repository's deterministic health
// score in every committed analysis eval result, in measurement order.
//   npm run eval:chart  →  docs/assets/dogfooding.svg
// Only measured numbers: each point is one evals/results/<date>-<commit>.json.
// The deterministic score leaves architecture and performance (the LLM's
// categories) at their base value, so it is comparable across results but
// not with a full report's score. The dashed line is the same measure under
// the v1 formula (linear penalties): the gap between the lines is the
// formula change (ADR-010); a rise in both is the analysis itself.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const resultsDir = join(process.cwd(), "evals", "results");
const points = readdirSync(resultsDir)
  .filter((name) => /^\d{4}-\d{2}-\d{2}-[0-9a-f]+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(join(resultsDir, name), "utf8")))
  .filter((result) => result.analysis?.thisRepository)
  .map((result) => {
    const repo = result.analysis.thisRepository;
    return {
      date: result.date,
      commit: result.commit,
      score: repo.deterministicHealthScore,
      // Results from before ADR-010 only had the linear formula.
      v1: repo.v1DeterministicHealthScore ?? repo.deterministicHealthScore,
      findings: repo.findings,
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date));

if (points.length === 0) throw new Error("No analysis eval results in evals/results");

const width = 760;
const height = 320;
const margin = { top: 48, right: 24, bottom: 72, left: 48 };
const plotW = width - margin.left - margin.right;
const plotH = height - margin.top - margin.bottom;
const x = (i) => margin.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
const y = (score) => margin.top + plotH - (score / 100) * plotH;

const line = (key) => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
const grid = [0, 25, 50, 75, 100]
  .map(
    (v) =>
      `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y(v)}" y2="${y(v)}" stroke="#9ca3af" stroke-opacity="0.25"/>` +
      `<text x="${margin.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
  )
  .join("\n  ");
const dots = points
  .map(
    (p, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="4" fill="#2563eb"><title>${p.commit} (${p.date.slice(0, 16)}): ${p.score} (v1 formula ${p.v1}), ${p.findings} findings</title></circle>`,
  )
  .join("\n  ");
const labels = points
  .map(
    (p, i) =>
      `<text transform="translate(${x(i).toFixed(1)},${height - margin.bottom + 14}) rotate(-40)" text-anchor="end">${p.commit}</text>`,
  )
  .join("\n  ");
const first = points[0];
const last = points[points.length - 1];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#6b7280">
  <title>Deterministic health score of this repository, ${first.score} to ${last.score}</title>
  <text x="${margin.left}" y="20" font-size="14" font-weight="600">Dogfooding: this repository's deterministic health score (${first.score} → ${last.score})</text>
  <text x="${margin.left}" y="36">One point per committed eval result, by measurement date. Dashed: same measure under the v1 formula.</text>
  ${grid}
  <path d="${line("v1")}" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 4"/>
  <path d="${line("score")}" fill="none" stroke="#2563eb" stroke-width="2.5"/>
  ${dots}
  ${labels}
</svg>
`;

const outDir = join(process.cwd(), "docs", "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "dogfooding.svg"), svg);
console.log(
  `dogfooding chart: ${points.length} results, ${first.commit} ${first.score} → ${last.commit} ${last.score} → docs/assets/dogfooding.svg`,
);

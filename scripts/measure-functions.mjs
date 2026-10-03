// Size of the heaviest Vercel functions after `next build`, by package
// (TD-41). Sums the files Next traced for each route (`route.js.nft.json`):
// on Linux this is close to, but not exactly, what Vercel reports
// (`vercel inspect --json` is the real number, against a 250 MiB limit).
// Run after a build: npm run measure:functions
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Routes that ship the ONNX runtime (next.config.ts): the workflow function,
// where the analysis steps run (ADR-005), and the chat.
const ROUTES = [".well-known/workflow/v1/flow", "api/chat"];
const TOP_PACKAGES = 12;
const MiB = 1024 * 1024;
// Gate on the traced sum, which is always above Vercel's own number: 200 MiB
// traced keeps a margin under Vercel's 250 MiB. analyze was 117 MiB traced
// (34.1 MiB on Vercel) after TD-41.
const MAX_TRACED_MIB = 200;

function measure(route) {
  const nft = resolve(".next/server/app", route, "route.js.nft.json");
  if (!existsSync(nft)) throw new Error(`No trace for ${route}: run next build first.`);
  const { files } = JSON.parse(readFileSync(nft, "utf8"));
  const byPackage = new Map();
  let total = 0;
  for (const rel of new Set(files)) {
    const abs = resolve(dirname(nft), rel);
    const stat = statSync(abs, { throwIfNoEntry: false });
    if (!stat?.isFile()) continue;
    total += stat.size;
    const path = abs.replaceAll("\\", "/");
    const packages = path.match(/node_modules\/(@[^/]+\/)?[^/]+/g);
    const key = packages ? packages.at(-1).slice("node_modules/".length) : "(app code)";
    byPackage.set(key, (byPackage.get(key) ?? 0) + stat.size);
  }
  return { route, total, byPackage };
}

const mib = (bytes) => (bytes / MiB).toFixed(1);
const lines = [`## Function size (traced files, ${process.platform})`, ""];
const tooBig = [];
for (const { route, total, byPackage } of ROUTES.map(measure)) {
  if (total > MAX_TRACED_MIB * MiB) tooBig.push(`${route} (${mib(total)} MiB)`);
  lines.push(`### \`${route}\` — ${mib(total)} MiB`, "", "| MiB | Package |", "|---:|---|");
  const top = [...byPackage].sort((a, b) => b[1] - a[1]).slice(0, TOP_PACKAGES);
  for (const [name, size] of top) lines.push(`| ${mib(size)} | ${name} |`);
  lines.push("");
}
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
if (tooBig.length > 0) {
  console.error(
    `Above ${MAX_TRACED_MIB} MiB traced: ${tooBig.join(", ")}. Vercel's limit is 250 MiB per function (TD-41).`,
  );
  process.exit(1);
}

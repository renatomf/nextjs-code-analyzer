// Code metrics for docs/baseline.md and the phase results (same method
// every time): production vs test files, lines per top-level folder, and
// which files import the database client or Drizzle.
// Run: npm run measure:code
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.cwd();
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(relative(root, p).replaceAll("\\", "/"));
  }
  return out;
}
const files = walk(join(root, "src"));
const isTest = (f) => /\.test\.tsx?$/.test(f) || f.startsWith("src/test/");
const prod = files.filter((f) => !isTest(f));
const tests = files.filter(isTest);
const lines = (f) => readFileSync(f, "utf8").split("\n").length;
const byTop = {};
for (const f of prod) {
  const top = f.split("/").slice(0, 2).join("/");
  byTop[top] = (byTop[top] ?? 0) + lines(f);
}
const imports = (f, re) => re.test(readFileSync(f, "utf8"));
const dbRe = /from ["']@\/lib\/db["']/;
const drizzleRe = /from ["']drizzle-orm(\/[^"']*)?["']/;
const dbFiles = prod.filter((f) => imports(f, dbRe) || imports(f, drizzleRe));
const group = (list) => {
  const g = {};
  for (const f of list) {
    const key = f.startsWith("src/modules/") ? f.split("/").slice(0, 4).join("/").replace(/\/[^/]+\.tsx?$/, "") : f.split("/").slice(0, 3).join("/");
    g[key] = (g[key] ?? 0) + 1;
  }
  return g;
};
console.log(JSON.stringify({
  productionFiles: prod.length,
  testFiles: tests.length,
  linesByTopFolder: byTop,
  appFilesWithDb: prod.filter((f) => f.startsWith("src/app/") && (imports(f, dbRe) || imports(f, /from ["']@\/db\/schema["']/))).length,
  filesWithDbOrDrizzle: dbFiles.length,
  whereDbOrDrizzle: group(dbFiles),
  dbFilesOutsideModules: dbFiles.filter((f) => !f.startsWith("src/modules/")),
}, null, 1));

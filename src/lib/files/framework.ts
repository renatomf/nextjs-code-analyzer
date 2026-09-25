import { z } from "zod";
import type { ExtractedFile } from "@/lib/files/filters";

/** Values stored in `projects.framework`. */
export const FRAMEWORKS = [
  "Next.js",
  "Nuxt",
  "Remix",
  "Astro",
  "NestJS",
  "Express",
  "Fastify",
  "Vue",
  "React",
  "TypeScript",
  "JavaScript",
  "Unknown",
] as const;

export type Framework = (typeof FRAMEWORKS)[number];

// package.json comes from an untrusted repo: malformed dependency maps are
// dropped instead of trusted as-is.
const depsSchema = z.record(z.string(), z.unknown()).optional().catch(undefined);

const packageJsonSchema = z.object({
  dependencies: depsSchema,
  devDependencies: depsSchema,
});

type PackageJson = z.infer<typeof packageJsonSchema>;

function hasDep(pkg: PackageJson, name: string): boolean {
  return [pkg.dependencies, pkg.devDependencies].some(
    (deps) => deps !== undefined && Object.hasOwn(deps, name),
  );
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

function depth(relativePath: string): number {
  return relativePath.split("/").length;
}

/** Root package.json first; otherwise the shallowest one (monorepos). */
function findPackageFile(files: ExtractedFile[]): ExtractedFile | undefined {
  return files
    .filter((file) => baseName(file.relativePath) === "package.json")
    .sort((a, b) => depth(a.relativePath) - depth(b.relativePath))[0];
}

function parsePackageJson(content: string): PackageJson | null {
  try {
    const result = packageJsonSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null; // invalid JSON
  }
}

/** Detect framework from package.json + config file hints */
export function detectFramework(
  files: ExtractedFile[],
  allRelativePaths: string[],
): Framework {
  const packageFile = findPackageFile(files);
  const pkg = packageFile ? parsePackageJson(packageFile.content) : null;

  if (pkg) {
    if (hasDep(pkg, "next")) return "Next.js";
    if (hasDep(pkg, "nuxt")) return "Nuxt";
    if (hasDep(pkg, "remix") || hasDep(pkg, "@remix-run/react")) return "Remix";
    if (hasDep(pkg, "astro")) return "Astro";
    if (hasDep(pkg, "@nestjs/core")) return "NestJS";
    if (hasDep(pkg, "express")) return "Express";
    if (hasDep(pkg, "fastify")) return "Fastify";
    if (hasDep(pkg, "vue")) return "Vue";
    if (hasDep(pkg, "react")) return "React";
  }

  // Match config file names exactly (e.g. next.config.ts), not substrings
  // of arbitrary paths like docs/next.config-notes.md.
  const names = new Set(allRelativePaths.map(baseName));
  const hasConfig = (prefix: string) =>
    ["js", "mjs", "cjs", "ts", "mts"].some((ext) => names.has(`${prefix}.${ext}`));

  if (hasConfig("next.config")) return "Next.js";
  if (hasConfig("nuxt.config")) return "Nuxt";
  if (hasConfig("astro.config")) return "Astro";

  const hasTs = allRelativePaths.some(
    (p) => p.endsWith(".ts") || p.endsWith(".tsx"),
  );
  const hasJs = allRelativePaths.some(
    (p) => p.endsWith(".js") || p.endsWith(".jsx"),
  );
  if (hasTs) return "TypeScript";
  if (hasJs) return "JavaScript";

  return "Unknown";
}

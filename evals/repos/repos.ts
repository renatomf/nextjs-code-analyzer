import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import type { IssueCategory } from "@/modules/analysis";

/**
 * Real open-source repositories with known, annotated problems (roadmap
 * Phase 7 dataset). Pinned to a commit and read like a GitHub import (the
 * real extractor); the source is downloaded once into evals/.cache, never
 * committed here.
 */

export type ExpectedProblem = {
  /** Any of these categories counts (e.g. ReDoS is security or performance). */
  categories: IssueCategory[];
  filePath: string;
  /** A line of the vulnerable code: the sample must include its chunk. */
  line: number;
  note: string;
};

export type RepoCase = {
  name: string;
  owner: string;
  repo: string;
  commit: string;
  license: string;
  expected: ExpectedProblem[];
};

/**
 * OWASP NodeGoat: a Node.js/Express app written to be vulnerable (OWASP Top
 * 10). Only problems active at this commit are listed: the fixes it keeps
 * commented out next to them do not count. Caveat: NodeGoat comments its own
 * flaws ("Insecure use of eval()"), which helps a reviewer; its recall is an
 * upper bound, not a typical value.
 */
export const NODEGOAT: RepoCase = {
  name: "nodegoat",
  owner: "OWASP",
  repo: "NodeGoat",
  commit: "c5cb68a7084e4ae7dcc60e6a98768720a81841e8",
  license: "Apache-2.0",
  expected: [
    {
      categories: ["security"],
      filePath: "app/routes/contributions.js",
      line: 32,
      note: "eval() of request body fields (server-side JS injection)",
    },
    {
      categories: ["security"],
      filePath: "app/data/allocations-dao.js",
      line: 78,
      note: "NoSQL injection: user input inside a $where expression",
    },
    {
      categories: ["security"],
      filePath: "app/routes/allocations.js",
      line: 18,
      note: "IDOR: userId taken from the URL instead of the session",
    },
    {
      categories: ["security"],
      filePath: "app/routes/index.js",
      line: 72,
      note: "Open redirect: res.redirect(req.query.url)",
    },
    {
      categories: ["security"],
      filePath: "app/routes/research.js",
      line: 15,
      note: "SSRF: server fetches a URL built from the query string",
    },
    {
      categories: ["security"],
      filePath: "app/data/user-dao.js",
      line: 25,
      note: "Passwords stored and compared in plain text",
    },
    {
      categories: ["security"],
      filePath: "app/data/profile-dao.js",
      line: 62,
      note: "SSN and date of birth stored unencrypted",
    },
    {
      categories: ["security", "performance"],
      filePath: "app/routes/profile.js",
      line: 59,
      note: "ReDoS: /([0-9]+)+\\#/ on user input",
    },
    {
      categories: ["security"],
      filePath: "server.js",
      line: 137,
      note: "No CSRF protection, session cookie without httpOnly, template autoescape off",
    },
  ],
};

export const REPO_CASES: RepoCase[] = [NODEGOAT];

const CACHE_DIR = join(process.cwd(), "evals", ".cache");

/** The repository's source files at its commit, as the analysis reads them. */
export async function loadRepo(repoCase: RepoCase) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const zipPath = join(CACHE_DIR, `${repoCase.repo}-${repoCase.commit}.zip`);
  if (!existsSync(zipPath)) {
    const url = `https://codeload.github.com/${repoCase.owner}/${repoCase.repo}/zip/${repoCase.commit}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      throw new Error(`Could not download ${repoCase.name} (${response.status}): ${url}`);
    }
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }

  // Same as a GitHub import: the archive's root folder is stripped.
  const extracted = await extractFromZipBuffer(readFileSync(zipPath), { stripRoot: true });
  if (!extracted.ok) throw new Error(`Could not read ${repoCase.name}: ${extracted.error}`);
  return extracted.sourceFiles
    .filter((file) => isSourceFile(file.relativePath))
    .map(({ relativePath, content }) => ({ relativePath, content }));
}

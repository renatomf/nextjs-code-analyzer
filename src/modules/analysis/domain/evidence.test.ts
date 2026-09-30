import { describe, expect, it } from "vitest";

import { verifyEvidence, type ClaimedIssue, type ReviewedChunk } from "./evidence";

const chunks: ReviewedChunk[] = [
  {
    filePath: "src/routes/users.ts",
    startLine: 3,
    content: [
      "export async function GET(request: Request) {",
      "  const name = new URL(request.url).searchParams.get(\"name\") ?? \"\";",
      "  const rows = await db.query(\"SELECT * FROM users WHERE name = '\" + name + \"'\");",
      "  return Response.json(rows);",
      "}",
    ].join("\n"),
  },
];

const claim = (overrides: Partial<ClaimedIssue>): ClaimedIssue => ({
  title: "SQL injection",
  description: "d",
  severity: "critical",
  category: "security",
  filePath: "src/routes/users.ts",
  quote: "await db.query(\"SELECT * FROM users WHERE name = '\" + name + \"'\")",
  ...overrides,
});

describe("verifyEvidence", () => {
  it("keeps an issue whose quote is in a chunk of its file, with its lines", () => {
    const { findings, dropped } = verifyEvidence([claim({})], chunks);

    expect(dropped).toEqual([]);
    expect(findings[0].evidence).toMatchObject({ startLine: 5, endLine: 5 });
    expect(findings[0]).not.toHaveProperty("quote");
  });

  it("ignores whitespace differences in the quote", () => {
    const { findings } = verifyEvidence(
      [claim({ quote: "const   rows =\n await db.query(" })],
      chunks,
    );

    expect(findings).toHaveLength(1);
  });

  it.each([
    ["a quote that is not in the code", { quote: "db.execute(rawSql)" }],
    ["no quote", { quote: undefined }],
    ["a file the reviewer never received", { filePath: "src/routes/other.ts" }],
    ["the right quote under another file", { filePath: "src/db.ts" }],
  ])("drops an issue with %s", (_, overrides) => {
    const { findings, dropped } = verifyEvidence([claim(overrides)], chunks);

    expect(findings).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it.each(["null", "", "  "])("treats the file path %j as project-wide", (filePath) => {
    const { findings } = verifyEvidence([claim({ filePath, severity: "low" })], chunks);

    expect(findings[0].filePath).toBeNull();
  });

  it("keeps project-wide issues but at most medium", () => {
    const { findings } = verifyEvidence(
      [claim({ filePath: null, severity: "critical", quote: undefined })],
      chunks,
    );

    expect(findings[0]).toMatchObject({ filePath: null, severity: "medium" });
  });
});

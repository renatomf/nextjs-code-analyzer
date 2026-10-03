import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { projects, reportShares, reports } from "@/db/schema";
import { db } from "@/lib/db";
import {
  createReportShare,
  findSharedReport,
  getReportShareState,
  revokeReportShare,
} from "@/modules/projects/server";
import { createProjectWithData, createUser, deleteUsers } from "@/test/integration/factories";

// Public report links on a real Postgres: only the owner creates or revokes,
// only finished reports are shared, revoked/expired/replaced tokens stop
// working, the token is never stored and free text is redacted.

// Assembled at runtime: no key-shaped literal in the source (secret scanning).
const STRIPE_LIKE = ["sk", "live", "abcdef123456"].join("_");

let alice: string;
let bob: string;

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
});

afterAll(async () => {
  await deleteUsers([alice, bob]);
});

async function sharedProject(label: string) {
  return createProjectWithData(alice, label);
}

async function shareRow(projectId: string) {
  const [row] = await db.select().from(reportShares).where(eq(reportShares.projectId, projectId));
  return row;
}

describe("createReportShare", () => {
  it("gives the owner a working link and stores only the token's hash", async () => {
    const projectId = await sharedProject("share-ok");

    const share = await createReportShare(alice, projectId, "7d");

    expect(share?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const report = await findSharedReport(share!.token);
    expect(report).toMatchObject({ projectName: "project-share-ok", healthScore: 80 });
    expect(report).not.toHaveProperty("repositoryUrl");

    const row = await shareRow(projectId);
    expect(row.tokenHash).not.toContain(share!.token);
    expect(JSON.stringify(row)).not.toContain(share!.token);
  });

  it("refuses another user's project", async () => {
    const projectId = await sharedProject("share-idor");

    expect(await createReportShare(bob, projectId, "7d")).toBeNull();
    expect(await shareRow(projectId)).toBeUndefined();
  });

  it("refuses a project whose analysis is not finished", async () => {
    const projectId = await sharedProject("share-running");
    await db.update(projects).set({ status: "processing" }).where(eq(projects.id, projectId));

    expect(await createReportShare(alice, projectId, "7d")).toBeNull();
  });

  it("replaces the previous link: the old token stops working", async () => {
    const projectId = await sharedProject("share-replace");
    const first = await createReportShare(alice, projectId, "7d");
    const second = await createReportShare(alice, projectId, "30d");

    expect(await findSharedReport(first!.token)).toBeNull();
    expect(await findSharedReport(second!.token)).not.toBeNull();
  });
});

describe("findSharedReport", () => {
  it("returns nothing for an unknown token", async () => {
    expect(await findSharedReport("x".repeat(43))).toBeNull();
  });

  it("stops working once expired", async () => {
    const projectId = await sharedProject("share-expired");
    const share = await createReportShare(alice, projectId, "7d");
    await db
      .update(reportShares)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(reportShares.projectId, projectId));

    expect(await findSharedReport(share!.token)).toBeNull();
  });

  it("keeps a no-expiry link working", async () => {
    const projectId = await sharedProject("share-never");
    const share = await createReportShare(alice, projectId, "never");

    expect(share?.expiresAt).toBeNull();
    expect(await findSharedReport(share!.token)).not.toBeNull();
  });

  it("redacts secrets the analysis quoted", async () => {
    const projectId = await sharedProject("share-redact");
    await db
      .update(reports)
      .set({
        issues: [
          {
            title: "Hardcoded Stripe key",
            description: `src/pay.ts sets apiKey = '${STRIPE_LIKE}' in code.`,
            severity: "critical",
            category: "security",
            filePath: "src/pay.ts",
          },
        ],
      })
      .where(eq(reports.projectId, projectId));
    const share = await createReportShare(alice, projectId, "7d");

    const report = await findSharedReport(share!.token);

    expect(JSON.stringify(report)).not.toContain(STRIPE_LIKE);
    expect(report?.issues[0].description).toContain("[REDACTED]");
  });

  it("tells the viewer when the report has no AI review, apart from the scores", async () => {
    const projectId = await sharedProject("share-no-ai");
    const scores = { architecture: 90, security: 70, performance: 90, codeQuality: 60, testing: 50 };
    await db
      .update(reports)
      .set({ categoryScores: { ...scores, aiReviewSkipped: "budget" } })
      .where(eq(reports.projectId, projectId));
    const share = await createReportShare(alice, projectId, "7d");

    const report = await findSharedReport(share!.token);

    expect(report?.aiReviewSkipped).toBe("budget");
    expect(report?.categoryScores).toEqual(scores);
  });

  it("shares the evidence's lines but never the quoted code", async () => {
    const projectId = await sharedProject("share-evidence");
    const quoted = "const rows = await db.query(sql + name);";
    await db
      .update(reports)
      .set({
        issues: [
          {
            title: "SQL built from input",
            description: "The query concatenates a request parameter.",
            severity: "critical",
            category: "security",
            filePath: "src/routes/users.ts",
            evidence: { startLine: 12, endLine: 12, snippet: quoted },
          },
        ],
      })
      .where(eq(reports.projectId, projectId));
    const share = await createReportShare(alice, projectId, "7d");

    const report = await findSharedReport(share!.token);

    expect(report?.issues[0].evidence).toEqual({ startLine: 12, endLine: 12 });
    expect(JSON.stringify(report)).not.toContain(quoted);
  });

  it("redacts secrets inside the occurrences of a grouped finding", async () => {
    const projectId = await sharedProject("share-redact-grouped");
    const occurrence = (file: string) => ({
      filePath: file,
      severity: "critical" as const,
      title: "Potential hardcoded secret",
      description: `${file} sets apiKey = '${STRIPE_LIKE}'.`,
    });
    await db
      .update(reports)
      .set({
        issues: [
          {
            title: "Potential hardcoded secrets (2)",
            description: "Possible credentials in the source.",
            severity: "critical",
            category: "security",
            filePath: "src/a.ts",
            rule: "hardcoded-secret",
            occurrences: [occurrence("src/a.ts"), occurrence("src/b.ts")],
          },
        ],
      })
      .where(eq(reports.projectId, projectId));
    const share = await createReportShare(alice, projectId, "7d");

    const report = await findSharedReport(share!.token);

    expect(JSON.stringify(report)).not.toContain(STRIPE_LIKE);
    expect(report?.issues[0].occurrences).toHaveLength(2);
    expect(report?.issues[0].occurrences?.[1].description).toContain("[REDACTED]");
  });
});

describe("revokeReportShare", () => {
  it("lets only the owner revoke, and the link stops working at once", async () => {
    const projectId = await sharedProject("share-revoke");
    const share = await createReportShare(alice, projectId, "never");

    expect(await revokeReportShare(bob, projectId)).toBe(false);
    expect(await findSharedReport(share!.token)).not.toBeNull();

    expect(await revokeReportShare(alice, projectId)).toBe(true);
    expect(await findSharedReport(share!.token)).toBeNull();
    expect(await revokeReportShare(alice, projectId)).toBe(false);
  });

  it("shows the link state to the owner only", async () => {
    const projectId = await sharedProject("share-state");
    await createReportShare(alice, projectId, "30d");

    expect(await getReportShareState(alice, projectId)).toMatchObject({ active: true });
    expect(await getReportShareState(bob, projectId)).toBeNull();
  });
});

it("deleting the project deletes its link", async () => {
  const projectId = await sharedProject("share-cascade");
  const share = await createReportShare(alice, projectId, "never");

  await db.delete(projects).where(eq(projects.id, projectId));

  expect(await shareRow(projectId)).toBeUndefined();
  expect(await findSharedReport(share!.token)).toBeNull();
});

import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { projects, usageEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { persistProjectFiles, readProjectFiles } from "@/lib/files/storage";
import { saveGitHubConnection } from "@/modules/identity/server";
import { createUser, deleteUsers } from "@/test/integration/factories";

// Characterization of re-analyzing a GitHub project before it moves into the
// projects module: fetch the latest code, replace the stored files, queue
// the project; every failure leaves the project failed with a user-facing
// message and the previous files in place. Real Postgres, extraction and
// quota; only the session, Next's cache and the GitHub download are mocked.

const mocks = vi.hoisted(() => ({ auth: vi.fn(), downloadGitHubZipball: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  downloadGitHubZipball: mocks.downloadGitHubZipball,
}));

import { retryFullAnalysis } from "@/lib/actions/analysis";
import { GitHubError } from "@/lib/github";

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.downloadGitHubZipball.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function githubUser({ connected = true } = {}) {
  const userId = await createUser();
  created.push(userId);
  mocks.auth.mockResolvedValue({ user: { id: userId } });
  if (connected) {
    await saveGitHubConnection(userId, { encryptedToken: "encrypted-token", login: "octo" });
  }
  return userId;
}

async function githubProject(
  userId: string,
  identity: { name: string; repositoryUrl: string | null } = {
    name: "octo/demo",
    repositoryUrl: "https://github.com/octo/demo",
  },
) {
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      source: "github",
      status: "completed",
      fileCount: 1,
      progressStep: "Complete",
      progressPercent: 100,
      ...identity,
    })
    .returning({ id: projects.id });
  await persistProjectFiles(userId, project.id, [
    { relativePath: "src/old.ts", content: "export const old = 1;\n", sizeBytes: 22 },
  ]);
  return project.id;
}

/** A GitHub zipball: everything under one root folder. */
async function zipball() {
  const zip = new JSZip();
  zip.file("octo-demo-abc123/src/new.ts", "export const fresh = 2;\n");
  zip.file("octo-demo-abc123/src/more.ts", "export const more = 3;\n");
  return zip.generateAsync({ type: "nodebuffer" });
}

function form(projectId: string) {
  const data = new FormData();
  data.set("projectId", projectId);
  return data;
}

async function projectState(projectId: string) {
  const [row] = await db
    .select({
      status: projects.status,
      progressStep: projects.progressStep,
      errorMessage: projects.errorMessage,
      fileCount: projects.fileCount,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row;
}

const storedPaths = async (userId: string, projectId: string) =>
  (await readProjectFiles(userId, projectId)).map((file) => file.relativePath).sort();

const usageCount = (userId: string) =>
  db.$count(usageEvents, and(eq(usageEvents.userId, userId), eq(usageEvents.type, "analysis")));

const redirectsToProgress = { digest: expect.stringMatching(/\/projects\/[0-9a-f-]+\/progress/) };

describe("retryFullAnalysis (GitHub project)", () => {
  it("fetches the latest code, replaces the stored files and queues the project", async () => {
    const userId = await githubUser();
    const projectId = await githubProject(userId);
    mocks.downloadGitHubZipball.mockResolvedValue(await zipball());

    await expect(retryFullAnalysis({}, form(projectId))).rejects.toMatchObject(redirectsToProgress);

    expect(mocks.downloadGitHubZipball).toHaveBeenCalledWith(
      { userId, encryptedToken: "encrypted-token" },
      "octo/demo",
    );
    expect(await storedPaths(userId, projectId)).toEqual(["src/more.ts", "src/new.ts"]);
    expect(await projectState(projectId)).toMatchObject({
      status: "queued",
      progressStep: "Latest code fetched — waiting to analyze",
      fileCount: 2,
      errorMessage: null,
    });
    expect(await usageCount(userId)).toBe(1);
  });

  it("finds the repository from the URL when the name has no owner", async () => {
    const userId = await githubUser();
    const projectId = await githubProject(userId, {
      name: "demo",
      repositoryUrl: "https://github.com/octo/demo.git",
    });
    mocks.downloadGitHubZipball.mockResolvedValue(await zipball());

    await expect(retryFullAnalysis({}, form(projectId))).rejects.toMatchObject(redirectsToProgress);

    expect(mocks.downloadGitHubZipball.mock.calls[0][1]).toBe("octo/demo");
  });

  it.each([
    {
      name: "an invalid archive",
      setup: async () => mocks.downloadGitHubZipball.mockResolvedValue(Buffer.from("not a zip")),
      message: "Invalid or corrupted ZIP file.",
    },
    {
      name: "a failed download",
      setup: async () =>
        mocks.downloadGitHubZipball.mockRejectedValue(
          new GitHubError("Repository not found or you do not have access to this private repo."),
        ),
      message: "Repository not found or you do not have access to this private repo.",
    },
  ])("fails on $name, keeping the previous files", async ({ setup, message }) => {
    const userId = await githubUser();
    const projectId = await githubProject(userId);
    await setup();

    expect(await retryFullAnalysis({}, form(projectId))).toEqual({ error: message });

    expect(await projectState(projectId)).toMatchObject({
      status: "failed",
      progressStep: "Re-analyze failed",
      errorMessage: message,
    });
    expect(await storedPaths(userId, projectId)).toEqual(["src/old.ts"]);
  });

  it("asks to connect GitHub when there is no token", async () => {
    const userId = await githubUser({ connected: false });
    const projectId = await githubProject(userId);

    expect(await retryFullAnalysis({}, form(projectId))).toEqual({
      error: "Connect GitHub in Settings before re-analyzing this repository.",
    });
    expect(mocks.downloadGitHubZipball).not.toHaveBeenCalled();
  });

  it("fails when the repository cannot be determined", async () => {
    const userId = await githubUser();
    const projectId = await githubProject(userId, { name: "demo", repositoryUrl: null });

    expect(await retryFullAnalysis({}, form(projectId))).toEqual({
      error: "Could not determine the GitHub repository for this project.",
    });
    expect(mocks.downloadGitHubZipball).not.toHaveBeenCalled();
  });
});

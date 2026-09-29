import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { codeChunks, projectFiles, projects, reports } from "@/db/schema";
import { db } from "@/lib/db";
import {
  createProjectWithData,
  createUser,
  deleteUsers,
} from "@/test/integration/factories";

// Schema-level guarantee (ON DELETE CASCADE), moved out of the billing tests.

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

describe("deleting a project", () => {
  it("removes its files, chunks and report (no private code left behind)", async () => {
    const userId = await createUser();
    created.push(userId);
    const projectId = await createProjectWithData(userId, "to-delete");

    await db.delete(projects).where(eq(projects.id, projectId));

    for (const table of [projectFiles, codeChunks, reports]) {
      const [row] = await db
        .select({ n: count() })
        .from(table)
        .where(eq(table.projectId, projectId));
      expect(row.n).toBe(0);
    }
  });
});

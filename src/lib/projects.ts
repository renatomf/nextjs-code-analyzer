import "server-only";

import { cache } from "react";

import { getProjectSummary as projectSummary } from "@/modules/projects/server";

/**
 * Project header data shared by the project layout and the overview page.
 * `cache` dedupes it per request, so both use a single query (React stays
 * out of the module). `userId` must come from the server session: another
 * user's project resolves to undefined.
 */
export const getProjectSummary = cache(projectSummary);

export type ProjectSummary = NonNullable<Awaited<ReturnType<typeof getProjectSummary>>>;

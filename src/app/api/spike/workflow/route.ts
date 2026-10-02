// SPIKE (ADR-005) — throwaway, never merged. Off everywhere except the
// Vercel deployments of the spike branch; signed-in users only.
import { getRun, start } from "workflow/api";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { spikeWorkflow } from "@/workflows/spike";

function enabled() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "spike/vercel-workflow"
  );
}

export async function POST(request: Request) {
  if (!enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fatal = new URL(request.url).searchParams.get("fatal") === "1";
  const run = await start(spikeWorkflow, [fatal]);
  return Response.json({ runId: run.runId });
}

export async function GET(request: Request) {
  if (!enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runId = z
    .string()
    .min(1)
    .max(200)
    .safeParse(new URL(request.url).searchParams.get("runId"));
  if (!runId.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const run = getRun(runId.data);
  const status = await run.status;
  const result = status === "completed" ? await run.returnValue : null;
  return Response.json({ status, result });
}

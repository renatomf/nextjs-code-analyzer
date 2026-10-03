// SPIKE (ADR-011) — throwaway, never merged. Off everywhere except the
// Vercel deployments of the spike branch; signed-in users only. Returns
// names, sizes and statuses only, never credentials.
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  allowBrowserUploads,
  deleteObject,
  listBucketsAt,
  presignedUpload,
  readObject,
  storageConfig,
} from "@/lib/storage/neon-storage";

const SPIKE_MAX_BYTES = 2 * 1024 * 1024; // small, so a 3 MB file proves the refusal
const PREVIEW_BRANCH = "br-withered-bonus-au7mjr8y";
const MAIN_BRANCH = "br-noisy-salad-aupbluog";

function enabled() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "spike/neon-storage"
  );
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cors") }),
  z.object({ action: z.literal("upload-url") }),
  z.object({ action: z.literal("check"), key: z.string().max(200) }),
  z.object({ action: z.literal("isolation") }),
]);

const errorName = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : "unknown";

export async function POST(request: Request) {
  if (!enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const config = storageConfig();
  if (!config) return Response.json({ error: "Storage not configured" }, { status: 500 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const input = parsed.data;

  try {
    if (input.action === "cors") {
      const origin = request.headers.get("origin") ?? "";
      if (!/^https:\/\/[a-z0-9-]+-renatomf76s-projects\.vercel\.app$/.test(origin)) {
        return Response.json({ error: `Unexpected origin ${origin}` }, { status: 400 });
      }
      await allowBrowserUploads(config, [origin]);
      return Response.json({ ok: true, origin });
    }

    if (input.action === "upload-url") {
      const key = `uploads/${userId}/${randomUUID()}.zip`;
      const post = await presignedUpload(config, key, SPIKE_MAX_BYTES);
      return Response.json({ key, url: post.url, fields: post.fields, maxBytes: SPIKE_MAX_BYTES });
    }

    if (input.action === "check") {
      // The step's rule: only this user's own keys.
      if (!input.key.startsWith(`uploads/${userId}/`)) {
        return Response.json({ error: "Not your upload" }, { status: 403 });
      }
      const bytes = await readObject(config, input.key);
      await deleteObject(config, input.key);
      const afterDelete = await readObject(config, input.key).then(
        () => "still there",
        (error: unknown) => errorName(error),
      );
      return Response.json({ size: bytes.byteLength, deleted: afterDelete });
    }

    // isolation: the preview credential against production's endpoint.
    if (!config.endpoint.includes(PREVIEW_BRANCH)) {
      return Response.json({ error: "Endpoint is not the preview branch's" }, { status: 500 });
    }
    const mainEndpoint = config.endpoint.replace(PREVIEW_BRANCH, MAIN_BRANCH);
    const result = await listBucketsAt(config, mainEndpoint).then(
      (list) => ({ reachedMain: true, buckets: list.Buckets?.length ?? 0 }),
      (error: unknown) => ({ reachedMain: false, error: errorName(error) }),
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorName(error) }, { status: 500 });
  }
}

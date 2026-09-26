import "server-only";

import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { rateLimits, users } from "@/db/schema";
import { getPlanLimits, getPlans } from "@/lib/billing/plans";
import { db } from "@/lib/db";

/**
 * Counts one hit for `key` and throws once more than `max` hits happen within
 * `windowMs`. A single atomic upsert, so concurrent requests on different
 * instances cannot bypass the limit.
 */
export async function assertRateLimit(
  key: string,
  max: number,
  windowMs: number,
  message: string,
): Promise<void> {
  const hashedKey = createHash("sha256").update(key).digest("hex");
  const expired = sql`${rateLimits.windowStart} <= now() - make_interval(secs => ${windowMs / 1000})`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key: hashedKey, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });

  if (row.count > max) {
    throw new RateLimitError(message);
  }
}

export async function assertChatRateLimit(userId: string): Promise<void> {
  const [user] = await db
    .select({ plan: users.plan, planStatus: users.planStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const limits = getPlanLimits(user?.plan, user?.planStatus);
  const max = limits.chatPerHour;
  const freeLabel = getPlans().free.label;
  const paidLabel = getPlans().premium.label;

  await assertRateLimit(
    `chat:${userId}`,
    max,
    60 * 60 * 1000,
    `Chat rate limit reached (${max} messages/hour on ${limits.label}). ${
      limits.label === freeLabel
        ? `Upgrade to ${paidLabel} for a higher limit.`
        : "Try again later."
    }`,
  );
}

export class RateLimitError extends Error {
  status = 429;

  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

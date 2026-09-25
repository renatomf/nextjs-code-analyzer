import "server-only";

import { and, count, eq, gte } from "drizzle-orm";

import { projects, usageEvents, users } from "@/db/schema";

import { db, type Db } from "@/lib/db";
import { getPlanLimits, getPlans } from "./plans";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export class BillingLimitError extends Error {
  code: "analyses" | "projects" | "chat";
  upgradeRequired = true;

  constructor(code: BillingLimitError["code"], message: string) {
    super(message);
    this.name = "BillingLimitError";
    this.code = code;
  }
}

// FOR UPDATE: when called inside a transaction, parallel requests of the same
// user wait here, so the limit checks cannot be bypassed by concurrent calls.
async function loadUserBilling(userId: string, executor: Executor) {
  const [user] = await executor
    .select({ plan: users.plan, planStatus: users.planStatus })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!user) throw new Error("User not found.");
  return user;
}

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function countAnalysesSince(
  userId: string,
  since: Date,
  executor: Executor,
) {
  const [{ value }] = await executor
    .select({ value: count() })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.type, "analysis"),
        gte(usageEvents.createdAt, since),
      ),
    );
  return value;
}

async function countProjects(userId: string, executor: Executor) {
  const [{ value }] = await executor
    .select({ value: count() })
    .from(projects)
    .where(eq(projects.userId, userId));
  return value;
}

/** Record one analysis attempt (new project or re-analyze). */
export async function recordAnalysisUsage(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor.insert(usageEvents).values({ userId, type: "analysis" });
}

export async function assertCanCreateProject(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  const user = await loadUserBilling(userId, executor);
  const limits = getPlanLimits(user.plan, user.planStatus);

  const projectCount = await countProjects(userId, executor);
  if (projectCount >= limits.maxProjects) {
    throw new BillingLimitError(
      "projects",
      `Project limit reached (${limits.maxProjects} on ${limits.label}). Upgrade to ${getPlans().premium.label} for unlimited projects.`,
    );
  }

  await assertCanRunAnalysis(userId, executor);
}

export async function assertCanRunAnalysis(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  const user = await loadUserBilling(userId, executor);
  const limits = getPlanLimits(user.plan, user.planStatus);

  const used = await countAnalysesSince(userId, startOfUtcDay(), executor);

  if (used >= limits.analysesPerDay) {
    const paid = getPlans().premium;
    throw new BillingLimitError(
      "analyses",
      `Daily analysis limit reached (${limits.analysesPerDay}/day on ${limits.label}). ${
        limits.label === getPlans().free.label
          ? `Upgrade to ${paid.label} for a higher limit, or try again tomorrow.`
          : "Try again tomorrow."
      }`,
    );
  }
}

/** `userId` must come from the server session. */
export async function getBillingSnapshot(userId: string) {
  const [user] = await db
    .select({
      plan: users.plan,
      planStatus: users.planStatus,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found.");

  const limits = getPlanLimits(user.plan, user.planStatus);
  const analysesUsedToday = await countAnalysesSince(
    userId,
    startOfUtcDay(),
    db,
  );
  const projectCount = await countProjects(userId, db);

  return {
    plan: user.plan,
    planStatus: user.planStatus,
    limits,
    analysesUsedToday,
    projectCount,
    // Only booleans leave the server, never the Stripe ids.
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasSubscription: Boolean(user.stripeSubscriptionId),
  };
}

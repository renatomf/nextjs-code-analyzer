import "server-only";

import { getPlanLimits, getPlans } from "@/lib/billing/plans";
import { and, eq, gte } from "drizzle-orm";

import { projects, usageEvents, users } from "@/db/schema";
import { db, type Db } from "@/lib/db";

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

  const projectCount = await executor.$count(projects, eq(projects.userId, userId));
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
  const since = startOfUtcDay();

  const used = await executor.$count(
    usageEvents,
    and(
      eq(usageEvents.userId, userId),
      eq(usageEvents.type, "analysis"),
      gte(usageEvents.createdAt, since),
    ),
  );

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
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      plan: true,
      planStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  if (!user) throw new Error("User not found.");

  const limits = getPlanLimits(user.plan, user.planStatus);
  const since = startOfUtcDay();
  const analysesUsedToday = await db.$count(
    usageEvents,
    and(
      eq(usageEvents.userId, userId),
      eq(usageEvents.type, "analysis"),
      gte(usageEvents.createdAt, since),
    ),
  );
  const projectCount = await db.$count(projects, eq(projects.userId, userId));

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

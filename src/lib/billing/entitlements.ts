import "server-only";

import { getPlanLimits, getPlans } from "@/lib/billing/plans";
import { and, eq, gte } from "drizzle-orm";

import { projects, usageEvents, users } from "@/db/schema";
import { db, type Db } from "@/lib/db";
import { DomainError } from "@/shared/errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export class BillingLimitError extends DomainError {
  code: "analyses" | "projects" | "chat";
  upgradeRequired = true;
  /** Short heading and body for UIs that lay the notice out (see `message`). */
  title?: string;
  detail?: string;
  /** False when the user is already on the paid plan. */
  canUpgrade = true;

  constructor(
    code: BillingLimitError["code"],
    message: string,
    notice?: { title: string; detail: string; canUpgrade: boolean },
  ) {
    super(message);
    this.name = "BillingLimitError";
    this.code = code;
    if (notice) {
      this.title = notice.title;
      this.detail = notice.detail;
      this.canUpgrade = notice.canUpgrade;
    }
  }
}

function limitError(
  code: BillingLimitError["code"],
  notice: { title: string; detail: string; canUpgrade: boolean },
) {
  return new BillingLimitError(
    code,
    `${notice.title}. ${notice.detail}`,
    notice,
  );
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
    throw limitError("projects", {
      title: "Project limit reached",
      detail: `You have ${projectCount} of ${limits.maxProjects} projects on the ${limits.label} plan. Upgrade to ${getPlans().premium.label} for unlimited projects, or delete a project to free a slot.`,
      canUpgrade: true,
    });
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
    const canUpgrade = limits.label === getPlans().free.label;
    throw limitError("analyses", {
      title: "Daily analysis limit reached",
      detail: `You've used all ${limits.analysesPerDay} analyses for today on the ${limits.label} plan. ${
        canUpgrade
          ? `Upgrade to ${paid.label} for up to ${paid.analysesPerDay} a day, or try again tomorrow.`
          : "Try again tomorrow."
      }`,
      canUpgrade,
    });
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

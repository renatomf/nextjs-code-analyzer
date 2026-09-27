import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ManageBillingButton,
  RefreshBillingButton,
  UpgradeToPremiumButton,
} from "@/components/billing/billing-buttons";
import { Button } from "@/components/ui/button";
import { users } from "@/db/schema";
import { connectGitHubAccount, disconnectGitHub } from "@/lib/actions/github";
import { auth } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import {
  effectivePlanId,
  getPlansWithStripePricing,
} from "@/lib/billing/plans";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{
    github?: string;
    github_error?: string;
    billing?: string;
    session_id?: string;
  }>;
};

function formatLimit(n: number) {
  return Number.isFinite(n) ? String(n) : "∞";
}

const SUCCESS_NOTICE =
  "border border-(--ca-line) border-l-2 border-l-(--ca-green-deep) bg-(--ca-green-soft) px-3 py-2 text-sm text-(--ca-ink)";
const ERROR_NOTICE =
  "border border-destructive/30 border-l-2 border-l-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive";

export default async function SettingsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const plans = await getPlansWithStripePricing();
  const paid = plans.premium;

  // Activate plan after Checkout even if the webhook was missed (local/dev).
  // The session id is validated and must belong to the signed-in user.
  if (params.billing === "success") {
    const { syncCheckoutSessionForUser, syncCustomerSubscriptionsForUser } =
      await import("@/lib/billing/sync-checkout");

    if (params.session_id) {
      await syncCheckoutSessionForUser(session.user.id, params.session_id);
    } else {
      await syncCustomerSubscriptionsForUser(session.user.id);
    }
  }

  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      authProvider: users.authProvider,
      githubUsername: users.githubUsername,
      githubAccessToken: users.githubAccessToken,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const billing = await getBillingSnapshot(session.user.id);
  const planId = effectivePlanId(billing.plan, billing.planStatus);
  const isPaid = planId === "premium";
  const current = plans[planId];
  // Only a boolean reaches the markup, never the (encrypted) token.
  const githubConnected = Boolean(user?.githubAccessToken);

  return (
    <main className="landing-shell ca-guides flex-1">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <p className="ca-kicker">Account</p>
            <h1 className="ca-title mt-6 text-5xl sm:text-6xl">Settings</h1>
            <p className="ca-lead mt-5 max-w-md">
              Manage your profile, plan, and GitHub connection.
            </p>
          </header>

          <div className="mb-6 space-y-3 empty:hidden">
            {params.github === "connected" ? (
              <p className={SUCCESS_NOTICE}>GitHub connected successfully.</p>
            ) : null}
            {/* The query value is not echoed: it is user-controlled text. */}
            {params.github_error ? (
              <p role="alert" className={ERROR_NOTICE}>
                GitHub connection failed. Try again.
              </p>
            ) : null}
            {params.billing === "success" ? (
              <p className={SUCCESS_NOTICE}>
                Payment received
                {isPaid
                  ? `. Your ${paid.label} plan is active.`
                  : `. If the plan still shows ${plans.free.label}, click “Refresh plan from Stripe”.`}
              </p>
            ) : null}
            {params.billing === "synced" ? (
              <p className={SUCCESS_NOTICE}>
                Plan synced from Stripe successfully.
              </p>
            ) : null}
            {params.billing === "sync_failed" ? (
              <p role="alert" className={ERROR_NOTICE}>
                No active Stripe subscription found for this account yet. Wait
                a moment and try Refresh again, or confirm payment in the
                Stripe Dashboard.
              </p>
            ) : null}
            {params.billing === "canceled" ? (
              <p className="border border-(--ca-line) bg-(--ca-paper-2) px-3 py-2 text-sm text-(--ca-muted)">
                Checkout was canceled. You can upgrade anytime.
              </p>
            ) : null}
          </div>

          <section className="ca-panel mb-5 space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="ca-title text-2xl">Billing</h2>
                <p className="mt-1 text-sm text-(--ca-muted)">
                  {plans.free.label} includes limited daily analyses.{" "}
                  {paid.label} unlocks higher limits.
                </p>
              </div>
              <span
                className={cn(
                  "ca-mono inline-flex border px-2.5 py-1 text-xs font-semibold uppercase",
                  isPaid
                    ? "border-(--ca-green-deep) bg-(--ca-green-soft) text-(--ca-ink)"
                    : "border-(--ca-line) bg-(--ca-paper-2) text-(--ca-muted)",
                )}
              >
                {current.label}
                {billing.planStatus === "past_due" ? " · past due" : ""}
              </span>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="border border-(--ca-line) px-3 py-2.5">
                <dt className="ca-mono text-xs text-(--ca-muted)">
                  Analyses today
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {billing.analysesUsedToday}
                  <span className="font-normal text-(--ca-muted)">
                    {" "}
                    / {formatLimit(billing.limits.analysesPerDay)}
                  </span>
                </dd>
              </div>
              <div className="border border-(--ca-line) px-3 py-2.5">
                <dt className="ca-mono text-xs text-(--ca-muted)">Projects</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {billing.projectCount}
                  <span className="font-normal text-(--ca-muted)">
                    {" "}
                    / {formatLimit(billing.limits.maxProjects)}
                  </span>
                </dd>
              </div>
              <div className="border border-(--ca-line) px-3 py-2.5 sm:col-span-2">
                <dt className="ca-mono text-xs text-(--ca-muted)">
                  Chat messages / hour
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  up to {billing.limits.chatPerHour}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              {isPaid ? (
                <ManageBillingButton />
              ) : (
                <>
                  <UpgradeToPremiumButton
                    label={`Upgrade to ${paid.label}`}
                    planLabel={paid.label}
                    priceLabel={paid.priceLabel}
                    features={paid.features}
                  />
                  {billing.hasStripeCustomer ? <ManageBillingButton /> : null}
                </>
              )}
              {billing.hasStripeCustomer ? <RefreshBillingButton /> : null}
            </div>

            {!isPaid ? (
              <ul className="space-y-1.5 text-sm text-(--ca-muted)">
                <li>
                  {paid.label} · {paid.priceLabel}
                </li>
                {paid.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="ca-panel mb-5 space-y-3 p-6">
            <h2 className="ca-title text-2xl">Profile</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-(--ca-muted)">Name</dt>
                <dd className="font-medium">{user?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--ca-muted)">Email</dt>
                <dd className="font-medium break-all">{user?.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--ca-muted)">Auth provider</dt>
                <dd className="font-medium capitalize">
                  {user?.authProvider ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="ca-panel space-y-4 p-6">
            <div>
              <h2 className="ca-title text-2xl">GitHub</h2>
              <p className="mt-1 text-sm text-(--ca-muted)">
                Required to select a repository. If you signed in with GitHub,
                the connection already appears here.
              </p>
            </div>
            {githubConnected ? (
              <>
                <p className="text-sm">
                  Connected as{" "}
                  <span className="font-semibold text-(--ca-green-deep)">
                    {user?.githubUsername ?? "GitHub"}
                  </span>
                </p>
                <form action={disconnectGitHub}>
                  <Button type="submit" variant="outline">
                    Disconnect GitHub
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-(--ca-muted)">
                  GitHub is not connected yet.
                </p>
                <form action={connectGitHubAccount}>
                  <Button type="submit">Connect GitHub</Button>
                </form>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard" />}
              className="px-0"
            >
              ← Back to projects
            </Button>
          </section>
        </div>
      </div>
    </main>
  );
}

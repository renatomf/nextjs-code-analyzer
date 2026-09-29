import { MainNav } from "@/components/app/main-nav";
import { UserMenu, type UserMenuPlan } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { effectivePlanId, getPlanCatalog } from "@/modules/billing";
import { getBillingSnapshot } from "@/modules/billing/server";
import Image from "next/image";
import Link from "next/link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();

  let plan: UserMenuPlan | undefined;
  let upgradeLabel: string | undefined;
  if (session?.user?.id) {
    const billing = await getBillingSnapshot(session.user.id);
    const planId = effectivePlanId(billing.plan, billing.planStatus);
    const plans = getPlanCatalog();
    const used = billing.analysesUsedToday;
    const max = billing.limits.analysesPerDay;

    plan = {
      label: plans[planId].label,
      isPaid: planId === "premium",
      used,
      limit: Number.isFinite(max) ? max : null,
    };
    if (!plan.isPaid) upgradeLabel = `Upgrade to ${plans.premium.label}`;
  }

  return (
    // Pages grow with their content; a page that must fill the screen exactly
    // (the chat marks itself with `data-chat-fill`) gets a fixed svh height.
    <div className="landing-shell ca-app flex min-h-svh flex-col has-data-chat-fill:h-svh">
      <header className="ca-appbar sticky top-0 z-40">
        {/* Three columns so the nav sits in the true center, as on the landing. */}
        <div className="ca-container flex h-14 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-2.5 justify-self-start"
          >
            <Image
              src="/logo-transparent.png"
              alt="codedriven"
              width={906}
              height={143}
              priority
              className="h-6 w-auto dark:invert dark:hue-rotate-180"
            />
          </Link>

          <MainNav />

          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/projects/new" />}
              className="hidden md:inline-flex"
            >
              New analysis
            </Button>
            {/* Keeps room for the avatar until 2xl, where it fits outside the
                container. */}
            <span aria-hidden className="w-8 2xl:hidden" />
          </div>
        </div>

        {/* Pinned to the header's right edge: below 2xl that lines up with the
            container's gutter, from 2xl it sits outside the content width. */}
        <div className="absolute top-1/2 right-(--ca-gutter) flex -translate-y-1/2">
          <UserMenu
            name={session?.user?.name}
            email={session?.user?.email}
            image={
              session?.user?.authProvider === "credentials"
                ? null
                : session?.user?.image
            }
            plan={plan}
            upgradeLabel={upgradeLabel}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

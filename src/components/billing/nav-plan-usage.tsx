import Link from "next/link";

import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { effectivePlanId, getPlans } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

function formatLimit(n: number) {
  return Number.isFinite(n) ? String(n) : "∞";
}

export async function NavPlanUsage({ userId }: { userId: string }) {
  const billing = await getBillingSnapshot(userId);
  const planId = effectivePlanId(billing.plan, billing.planStatus);
  const plans = getPlans();
  const label = plans[planId].label;
  const isPaid = planId === "premium";
  const used = billing.analysesUsedToday;
  const max = billing.limits.analysesPerDay;
  const nearLimit = Number.isFinite(max) && used / max >= 0.8;

  return (
    <Link
      href="/settings"
      title="Open billing settings"
      className={cn(
        "ca-mono hidden items-center gap-2 border px-2.5 py-1 text-xs transition-colors sm:inline-flex",
        isPaid
          ? "border-(--ca-green-deep) bg-(--ca-green-soft) text-(--ca-ink)"
          : "border-(--ca-line) bg-(--ca-card) text-(--ca-ink) hover:border-(--ca-green-deep)",
      )}
    >
      <span
        className={cn(
          "px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
          isPaid
            ? "bg-(--ca-green) text-[#050505]"
            : "bg-(--ca-paper-2) text-(--ca-muted)",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-medium tabular-nums",
          nearLimit
            ? "text-amber-700 dark:text-amber-300"
            : "text-(--ca-muted)",
        )}
      >
        {used}/{formatLimit(max)}
        <span className="ms-1 hidden font-normal lg:inline">today</span>
      </span>
    </Link>
  );
}

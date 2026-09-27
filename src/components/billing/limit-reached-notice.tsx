"use client";

import { UpgradeToPremiumButton } from "@/components/billing/billing-buttons";
import type { LimitNotice } from "@/lib/actions/github";

export function LimitReachedNotice({ limit }: { limit: LimitNotice }) {
  return (
    <div
      role="alert"
      className="ca-panel border-l-2 border-l-(--ca-green-deep) p-5"
    >
      <p className="ca-kicker">Plan limit</p>
      <p className="mt-4 text-lg font-semibold tracking-tight">{limit.title}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-(--ca-muted)">
        {limit.detail}
      </p>
      {limit.upgrade ? (
        <UpgradeToPremiumButton
          className="mt-5"
          label={`Upgrade to ${limit.upgrade.label}`}
          planLabel={limit.upgrade.label}
          priceLabel={limit.upgrade.priceLabel}
          features={limit.upgrade.features}
        />
      ) : null}
    </div>
  );
}

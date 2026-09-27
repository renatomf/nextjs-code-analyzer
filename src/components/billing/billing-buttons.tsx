"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  openBillingPortal,
  refreshBillingFromStripe,
  startPremiumCheckout,
} from "@/lib/actions/billing";

type UpgradeProps = {
  className?: string;
  label?: string;
  planLabel?: string;
  priceLabel?: string;
  features?: string[];
};

export function UpgradeToPremiumButton({
  className,
  label = "Upgrade to Premium",
  planLabel = "Premium",
  priceLabel = "See checkout",
  features = [],
}: UpgradeProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmCheckout() {
    startTransition(() => {
      void startPremiumCheckout();
    });
  }

  return (
    <>
      <Button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => setOpen(true)}
      >
        {pending ? "Redirecting to Stripe..." : label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Confirm {planLabel} upgrade</DialogTitle>
            <DialogDescription>
              Review your plan, then continue to Stripe Checkout to pay
              securely. You can cancel anytime from billing settings.
            </DialogDescription>
          </DialogHeader>

          <div className="ca-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold tracking-tight">{planLabel}</p>
              <p className="text-lg font-bold tabular-nums text-(--ca-green-deep)">
                {priceLabel}
              </p>
            </div>
            {features.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-(--ca-muted)">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-(--ca-green-deep)">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={confirmCheckout}
            >
              {pending ? "Redirecting..." : "Continue to Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Use UpgradeToPremiumButton */
export function UpgradeToProButton(props: UpgradeProps) {
  return <UpgradeToPremiumButton {...props} />;
}

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          void openBillingPortal();
        });
      }}
    >
      {pending ? "Opening portal..." : "Manage billing"}
    </Button>
  );
}

export function RefreshBillingButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          void refreshBillingFromStripe();
        });
      }}
    >
      {pending ? "Syncing..." : "Refresh plan from Stripe"}
    </Button>
  );
}

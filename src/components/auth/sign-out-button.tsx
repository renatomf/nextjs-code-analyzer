"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      kicker="Session"
      titleDim="Sign"
      title="out?"
      description="You will need to sign in again to access your projects and analyses."
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
      onConfirm={signOutAction}
    />
  );
}

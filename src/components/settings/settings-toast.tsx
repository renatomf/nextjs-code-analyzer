"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

export type SettingsNotice = {
  type: "success" | "error" | "info";
  message: string;
};

/**
 * Shows the redirect notice (GitHub / Stripe) as a toast, then drops the query
 * params so a refresh does not show it again.
 */
export function SettingsToast({ notices }: { notices: SettingsNotice[] }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (notices.length === 0) return;

    // The id dedupes the toast when the effect runs twice in dev.
    for (const notice of notices) {
      toast[notice.type](notice.message, { id: notice.message });
    }
    router.replace(pathname, { scroll: false });
  }, [notices, pathname, router]);

  return null;
}

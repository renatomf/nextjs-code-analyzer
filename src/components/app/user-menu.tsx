"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";

import { SignOutDialog } from "@/components/auth/sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type UserMenuPlan = {
  label: string;
  isPaid: boolean;
  used: number;
  /** `null` means unlimited. */
  limit: number | null;
};

type UserMenuProps = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  plan?: UserMenuPlan;
  upgradeLabel?: string;
};

export function UserMenu({
  name,
  email,
  image,
  plan,
  upgradeLabel,
}: UserMenuProps) {
  const { theme, setTheme } = useTheme();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const initial = (name || email || "?").charAt(0).toUpperCase();
  const usage =
    plan && plan.limit !== null ? Math.min(plan.used / plan.limit, 1) : 0;
  const atLimit = usage >= 1;
  const nearLimit = usage >= 0.8;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open account menu"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-(--ca-line) bg-(--ca-card) text-xs font-semibold text-(--ca-ink) transition-colors outline-none hover:border-(--ca-green-deep) focus-visible:ring-2 focus-visible:ring-(--ca-green-deep) data-popup-open:border-(--ca-green-deep)"
        >
          {image ? (
            <Image
              src={image}
              alt=""
              width={32}
              height={32}
              unoptimized
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            initial
          )}
        </DropdownMenuTrigger>

        {/* sideOffset 13: the 32px avatar is centered in the 56px navbar, so
            the menu opens right at the navbar's bottom border. */}
        <DropdownMenuContent align="end" sideOffset={13} className="w-54">
          <div className="px-2 py-2">
            {name ? (
              <p className="truncate text-sm font-semibold">{name}</p>
            ) : null}
            {email ? (
              <p className="truncate text-sm text-(--ca-muted)">{email}</p>
            ) : null}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme ?? "system"}
              onValueChange={(value) => setTheme(value)}
            >
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>

          {plan ? (
            <>
              <DropdownMenuSeparator />
              {/* Plan card: usage up front, reset time, upgrade kept with it. */}
              <div className="mx-1 my-2 bg-(--ca-card) p-2.5 ring-1 ring-(--ca-line)">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "ca-mono inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                      plan.isPaid
                        ? "bg-(--ca-green) text-[#050505]"
                        : "bg-(--ca-paper-2) text-(--ca-muted)",
                    )}
                  >
                    {plan.isPaid ? (
                      <Sparkles className="size-3" aria-hidden />
                    ) : null}
                    {plan.label}
                  </span>
                  <span className="ca-mono text-xs text-(--ca-muted) tabular-nums">
                    <span
                      className={cn(
                        "font-semibold",
                        atLimit
                          ? "text-red-600 dark:text-red-400"
                          : nearLimit
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-(--ca-ink)",
                      )}
                    >
                      {plan.used}
                    </span>
                    /{plan.limit ?? "∞"} today
                  </span>
                </div>

                {plan.limit !== null ? (
                  <div className="mt-2 h-1 bg-(--ca-paper-2)">
                    <div
                      className={cn(
                        "h-full transition-[width] duration-500",
                        atLimit
                          ? "bg-red-500"
                          : nearLimit
                            ? "bg-amber-500"
                            : plan.isPaid
                              ? "bg-(--ca-green)"
                              : "bg-(--ca-green-deep)",
                      )}
                      style={{ width: `${usage * 100}%` }}
                    />
                  </div>
                ) : null}

                <p className="ca-mono mt-1.5 text-[0.66rem] text-(--ca-soft)">
                  {plan.limit === null
                    ? "Unlimited analyses"
                    : atLimit
                      ? "Limit reached · resets 00:00 UTC"
                      : `${plan.limit - plan.used} left · resets 00:00 UTC`}
                </p>

                {upgradeLabel ? (
                  <DropdownMenuItem
                    render={<Link href="/settings" />}
                    className="mt-2 justify-center bg-(--ca-green) py-1.5 font-medium text-[#050505] focus:bg-(--ca-green-deep) focus:text-white not-data-[variant=destructive]:focus:**:text-white"
                  >
                    <Sparkles aria-hidden />
                    {upgradeLabel}
                  </DropdownMenuItem>
                ) : null}
              </div>
            </>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setSignOutOpen(true)}
            className="focus:bg-(--ca-green)! focus:text-[#050505]! focus:**:text-[#050505]!"
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  );
}

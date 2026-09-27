import { MainNav } from "@/components/app/main-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NavPlanUsage } from "@/components/billing/nav-plan-usage";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import Link from "next/link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="landing-shell flex min-h-svh flex-col">
      <header className="ca-appbar sticky top-0 z-40">
        {/* Three columns so the nav sits in the true center, as on the landing.
            From 2xl the container is `static` so the theme toggle can pin to
            the header's right edge, outside the content width. */}
        <div className="ca-container flex h-14 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr] 2xl:static!">
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-2.5 justify-self-start"
          >
            <span className="ca-diamond text-(--ca-green-deep)" aria-hidden />
            <span className="ca-display hidden text-sm tracking-tight sm:inline">
              AI Codebase Auditor
            </span>
          </Link>

          <MainNav />

          {/* From md the actions fill the right column, so the plan badge can
              sit centered between the nav and the account controls. */}
          <div className="flex shrink-0 items-center gap-2 justify-self-stretch">
            <div className="flex flex-1 justify-center">
              {session?.user?.id ? (
                <NavPlanUsage userId={session.user.id} />
              ) : null}
            </div>
            {/* Below 2xl there's no room outside the container, so it sits
                with the account controls and New analysis keeps the right edge. */}
            <ThemeToggle className="2xl:absolute 2xl:top-2.5 2xl:right-12" />
            <SignOutButton />
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/projects/new" />}
              className="hidden md:inline-flex"
            >
              New analysis
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-shell flex min-h-svh flex-col">
      <header className="ca-appbar sticky top-0 z-40">
        <div className="ca-container flex h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2.5"
            >
              <span className="ca-diamond text-(--ca-green-deep)" aria-hidden />
              <span className="ca-display hidden text-sm tracking-tight sm:inline">
                AI Codebase Auditor
              </span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1">
              <Link href="/dashboard" className="ca-nav-link">
                Projects
              </Link>
              <Link href="/projects/new" className="ca-nav-link">
                Analyze
              </Link>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
            <Button
              size="sm"
              bar
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

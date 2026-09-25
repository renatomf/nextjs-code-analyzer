import Link from "next/link";

import { HeroSilk } from "@/components/hero-silk";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  children: React.ReactNode;
  mode: "login" | "register";
};

const CONTENT = {
  register: {
    kicker: "Create account",
    accent: "Start",
    title: "auditing your code",
    lead: "Three steps from sign up to your first health report.",
    steps: [
      { n: "01", label: "Sign up your account", active: true },
      { n: "02", label: "Connect a repository", active: false },
      { n: "03", label: "Review your health report", active: false },
    ],
  },
  login: {
    kicker: "Sign in",
    accent: "Welcome",
    title: "back",
    lead: "Pick up where you left off: reports, chat, and your issue roadmap.",
    steps: [
      { n: "01", label: "Sign in to your account", active: true },
      { n: "02", label: "Open your dashboard", active: false },
      { n: "03", label: "Analyze a repository", active: false },
    ],
  },
} as const;

export function AuthShell({ children, mode }: AuthShellProps) {
  const content = CONTENT[mode];

  return (
    <div className="landing-shell auth-shell grid min-h-svh lg:grid-cols-[1fr_1fr]">
      <aside className="ca-hero ca-dark ca-grain ca-guides auth-panel hidden lg:flex">
        <HeroSilk className="ca-hero-silk" />

        <div className="relative z-10 flex flex-1 flex-col px-(--ca-gutter) py-8">
          <Link
            href="/"
            className="ca-display landing-reveal self-start text-sm tracking-tight text-white"
          >
            AI Codebase Auditor
          </Link>

          <div className="mt-auto max-w-md pb-[clamp(4rem,12vh,8rem)]">
            <p className="ca-kicker landing-reveal landing-reveal-delay-1">
              {content.kicker}
            </p>
            <h1 className="ca-title landing-reveal landing-reveal-delay-1 mt-6 text-5xl xl:text-[4.25rem]">
              <span className="ca-accent">{content.accent}</span> {content.title}
            </h1>
            <p className="ca-lead landing-reveal landing-reveal-delay-2 mt-6 max-w-xs">
              {content.lead}
            </p>

            <ol className="landing-reveal landing-reveal-delay-3 mt-12">
              {content.steps.map((step) => (
                <li
                  key={step.n}
                  className="ca-row grid grid-cols-[4.5rem_1fr] items-center py-4"
                >
                  <span
                    className={cn(
                      "ca-step ca-mono text-xs",
                      step.active ? "text-(--ca-green)" : "text-(--ca-soft)",
                    )}
                  >
                    {step.n}
                  </span>
                  <p
                    className={cn(
                      "text-sm font-medium tracking-tight",
                      step.active ? "text-white" : "text-(--ca-muted)",
                    )}
                  >
                    {step.label}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* <p className="ca-mono text-xs text-[#666]">
            Health reports · grounded chat · issue roadmap
          </p> */}
        </div>

        <p className="ca-display auth-wordmark" aria-hidden>
          Auditor
        </p>
      </aside>

      <main className="auth-main flex flex-col px-(--ca-gutter) py-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="ca-display text-xs tracking-tight text-(--ca-ink) lg:invisible"
          >
            AI Codebase Auditor
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="landing-reveal landing-reveal-delay-2 w-full max-w-105">
            {children}
          </div>
        </div>

        {/* <p className="ca-mono text-center text-[0.7rem] text-(--ca-soft)">
          © AI Codebase Auditor
        </p> */}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ReportView } from "@/components/projects/report-view";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { findSharedReport } from "@/modules/projects/server";

// Public, read-only report behind a share token. No session: it is outside
// the proxy matcher. The token rides in the URL, so the page is never
// indexed, cached or leaked through the Referer (see also next.config.ts).
export const metadata: Metadata = {
  title: "Shared report · codedriven",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// 256-bit base64url token (createReportShare): anything else is not a link.
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// Per IP: generous for a reader, but stops scanning for valid tokens.
const VIEWS_MAX_PER_MINUTE = 30;

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharedReportPage({ params }: PageProps) {
  const { token } = await params;
  // Invalid, unknown, revoked and expired links all get the same 404.
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) notFound();

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    await assertRateLimit(
      `report-view:${ip}`,
      VIEWS_MAX_PER_MINUTE,
      60 * 1000,
      "Too many requests. Try again in a minute.",
    );
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    return (
      <main className="landing-shell ca-guides flex flex-1 flex-col">
        <div className="ca-container py-16">
          <p className="ca-kicker">Shared report</p>
          <p className="mt-4 text-sm text-(--ca-muted)">{error.message}</p>
        </div>
      </main>
    );
  }

  const report = await findSharedReport(parsed.data);
  if (!report) notFound();

  return (
    <main className="landing-shell ca-guides flex flex-1 flex-col">
      <div className="ca-container flex flex-col gap-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ca-kicker">Shared report · read only</p>
            <h1 className="ca-title mt-4 text-4xl break-all">{report.projectName}</h1>
            <p className="mt-2 text-sm text-(--ca-muted)">
              {report.framework ? `${report.framework} · ` : ""}
              Analyzed on {report.analyzedAt.toISOString().slice(0, 10)}. Secrets
              are redacted; the source code is not shared.
            </p>
          </div>
          <Link
            href="/"
            className="font-mono text-xs text-(--ca-muted) underline-offset-4 hover:text-(--ca-ink) hover:underline"
          >
            Made with codedriven
          </Link>
        </header>

        <ReportView
          healthScore={report.healthScore}
          categoryScores={report.categoryScores}
          summaries={report.summaries}
          issues={report.issues}
        />
      </div>
    </main>
  );
}

import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/shared/sentry-options";

// Browser errors and page-load/navigation traces (roadmap Phase 4). No DSN =
// off. No Session Replay: it would record the user's code on screen.
Sentry.init({
  ...sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_VERCEL_ENV),
  integrations: [Sentry.browserTracingIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

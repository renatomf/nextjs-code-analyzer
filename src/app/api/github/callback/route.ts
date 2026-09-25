import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import {
  exchangeGitHubCode,
  getAppUrl,
  GITHUB_OAUTH_NONCE_COOKIE,
  verifyGitHubOAuthState,
} from "@/lib/github";

const callbackSchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(2048),
});

// Fixed codes only: GitHub's `error` param is never reflected into the URL.
type CallbackResult =
  | "connected"
  | "access_denied"
  | "oauth_error"
  | "missing_code"
  | "invalid_state"
  | "exchange_failed";

function redirectToSettings(result: CallbackResult) {
  const url = new URL("/settings", getAppUrl());
  if (result === "connected") {
    url.searchParams.set("github", "connected");
  } else {
    url.searchParams.set("github_error", result);
  }

  const response = NextResponse.redirect(url);
  // The nonce is single-use: drop it whatever the outcome.
  response.cookies.delete(GITHUB_OAUTH_NONCE_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", getAppUrl()));
  }

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    return redirectToSettings(
      oauthError === "access_denied" ? "access_denied" : "oauth_error",
    );
  }

  const parsed = callbackSchema.safeParse({
    code: params.get("code"),
    state: params.get("state"),
  });
  if (!parsed.success) {
    return redirectToSettings("missing_code");
  }

  // State must be signed by us, fresh, match the nonce cookie of this browser
  // and belong to the logged-in user (blocks CSRF / account-linking attacks).
  const valid = verifyGitHubOAuthState(parsed.data.state, {
    sessionUserId: session.user.id,
    nonce: request.cookies.get(GITHUB_OAUTH_NONCE_COOKIE)?.value,
  });
  if (!valid) {
    return redirectToSettings("invalid_state");
  }

  const userId = session.user.id;

  try {
    const { accessToken, login } = await exchangeGitHubCode(parsed.data.code);

    const updated = await db
      .update(users)
      .set({
        githubAccessToken: encryptToken(accessToken, userId),
        githubUsername: login,
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return redirectToSettings("exchange_failed");
    }

    return redirectToSettings("connected");
  } catch {
    console.error("GitHub OAuth callback failed");
    return redirectToSettings("exchange_failed");
  }
}

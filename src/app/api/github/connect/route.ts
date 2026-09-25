import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  createGitHubOAuthState,
  getAppUrl,
  getGitHubAuthorizeUrl,
  GITHUB_OAUTH_NONCE_COOKIE,
  GITHUB_OAUTH_NONCE_MAX_AGE_S,
} from "@/lib/github";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", getAppUrl()));
  }

  try {
    const { state, nonce } = createGitHubOAuthState(session.user.id);

    const response = NextResponse.redirect(getGitHubAuthorizeUrl(state));
    // Ties the state to this browser; the callback checks and deletes it.
    // `lax` is required so the cookie is sent on GitHub's top-level redirect back.
    response.cookies.set(GITHUB_OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GITHUB_OAUTH_NONCE_MAX_AGE_S,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("Failed to start GitHub OAuth flow");
    const url = new URL("/settings", getAppUrl());
    url.searchParams.set("github_error", "oauth_error");
    return NextResponse.redirect(url);
  }
}

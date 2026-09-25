import "server-only";

import NextAuth from "next-auth";
import { compare, hash } from "bcryptjs";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, isNull } from "drizzle-orm";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";

import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { loginSchema } from "@/lib/validations/auth";

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 5000;

// Compared against when the user does not exist, so response time does not
// reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
function getDummyHash() {
  dummyHash ??= hash("dummy-password-for-timing", 12);
  return dummyHash;
}

type AdapterSchema = NonNullable<Parameters<typeof DrizzleAdapter<typeof db>>[1]>;

// The cast is type-only: `.enableRLS()` drops a method the adapter's types
// expect, and they want `sessionToken` as the primary key (ours is unique, and
// the sessions table is unused with the JWT strategy). Column names match.
const drizzleAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
} as unknown as AdapterSchema);

// OAuth tokens are never stored in plain text: the GitHub token is saved
// encrypted on the user row (see events.signIn) and the rest are not needed.
const adapter: Adapter = {
  ...drizzleAdapter,
  linkAccount: (account) =>
    drizzleAdapter.linkAccount!({
      ...account,
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
    }),
};

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function isGithubEmailVerified(accessToken: string, email: string) {
  const res = await fetch(`${GITHUB_API}/user/emails`, {
    headers: githubHeaders(accessToken),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!res.ok) return false;

  const emails = (await res.json()) as { email: string; verified: boolean }[];
  return emails.some(
    (entry) => entry.verified && entry.email.toLowerCase() === email.toLowerCase(),
  );
}

async function fetchGithubUsername(accessToken: string) {
  try {
    const res = await fetch(`${GITHUB_API}/user`, {
      headers: githubHeaders(accessToken),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;

    const profile = (await res.json()) as { login?: string };
    return profile.login;
  } catch {
    console.error("Failed to fetch GitHub profile");
    return undefined;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
          columns: { id: true, name: true, email: true, image: true, passwordHash: true },
        });

        const valid = await compare(
          parsed.data.password,
          user?.passwordHash ?? (await getDummyHash()),
        );
        if (!user?.passwordHash || !valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Email-based account linking is only safe when the provider has verified
    // that the user owns the email address.
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;
      if (!user.email) return false;

      if (account.provider === "google") {
        return profile?.email_verified === true;
      }

      if (account.provider === "github") {
        if (!account.access_token) return false;
        try {
          return await isGithubEmailVerified(account.access_token, user.email);
        } catch {
          console.error("Failed to verify GitHub email");
          return false;
        }
      }

      return false;
    },
  },
  events: {
    // An OAuth provider just proved ownership of this email. If the account had
    // an unverified password (possibly registered by someone else), drop it.
    async linkAccount({ user }) {
      if (!user.id) return;

      await db
        .update(users)
        .set({ passwordHash: null, emailVerified: new Date() })
        .where(and(eq(users.id, user.id), isNull(users.emailVerified)));
    },
    async signIn({ user, account }) {
      if (!user.id || !account) return;

      const data: {
        authProvider: string;
        githubAccessToken?: string;
        githubUsername?: string;
      } = {
        authProvider: account.provider === "credentials" ? "email" : account.provider,
      };

      if (account.provider === "github" && account.access_token) {
        data.githubAccessToken = encryptToken(account.access_token, user.id);

        const username = await fetchGithubUsername(account.access_token);
        if (username) data.githubUsername = username;
      }

      await db.update(users).set(data).where(eq(users.id, user.id));
    },
  },
});

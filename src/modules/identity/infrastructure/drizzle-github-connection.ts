import { and, eq } from "drizzle-orm";

import { accounts, users } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * The user's account data and GitHub connection. Every function takes the
 * session's `userId` (never a client-sent id). The GitHub token is stored
 * encrypted and bound to its owner (see lib/encryption); only server code
 * that calls GitHub reads it, and pages only get a boolean.
 */

/** For server code that calls GitHub: the encrypted token and the login. */
export async function getGitHubConnection(userId: string) {
  const [user] = await db
    .select({
      githubAccessToken: users.githubAccessToken,
      githubUsername: users.githubUsername,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user;
}

/** What the settings page shows. The token never leaves this function. */
export async function getAccountSettings(userId: string) {
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      authProvider: users.authProvider,
      githubUsername: users.githubUsername,
      githubAccessToken: users.githubAccessToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return undefined;
  const { githubAccessToken, ...account } = user;
  return { ...account, githubConnected: Boolean(githubAccessToken) };
}

/** Stores a (already encrypted) token after the OAuth callback. */
export async function saveGitHubConnection(
  userId: string,
  connection: { encryptedToken: string; login: string },
): Promise<boolean> {
  const updated = await db
    .update(users)
    .set({
      githubAccessToken: connection.encryptedToken,
      githubUsername: connection.login,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}

/** Forgets the token and the GitHub sign-in link, all or nothing. */
export async function disconnectGitHub(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ githubAccessToken: null, githubUsername: null })
      .where(eq(users.id, userId));

    await tx
      .delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "github")));
  });
}

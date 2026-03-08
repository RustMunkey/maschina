import { db, oauthAccounts, users } from "@maschina/db";
import { and, eq } from "@maschina/db";
import { randomUUID } from "node:crypto";

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface OAuthResult {
  userId: string;
  isNewUser: boolean;
}

// Find existing user by OAuth provider, or create one
export async function upsertOAuthUser(profile: OAuthProfile): Promise<OAuthResult> {
  // Check if OAuth account already linked
  const [existing] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerAccountId, profile.providerAccountId),
      ),
    )
    .limit(1);

  if (existing) {
    // Update tokens
    await db
      .update(oauthAccounts)
      .set({
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(oauthAccounts.provider, profile.provider),
          eq(oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      );

    return { userId: existing.userId, isNewUser: false };
  }

  // Check if user with this email already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  let userId: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create new user
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      emailVerified: true, // OAuth emails are pre-verified
    });
    isNewUser = true;
  }

  // Link OAuth account
  await db.insert(oauthAccounts).values({
    userId,
    provider: profile.provider,
    providerAccountId: profile.providerAccountId,
    accessToken: profile.accessToken,
    refreshToken: profile.refreshToken,
    expiresAt: profile.expiresAt,
  });

  return { userId, isNewUser };
}

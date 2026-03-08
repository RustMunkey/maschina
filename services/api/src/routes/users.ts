import { revokeAllSessions } from "@maschina/auth";
import { verifyPassword } from "@maschina/auth";
import { db } from "@maschina/db";
import { sessions, users } from "@maschina/db";
import { and, eq, ne } from "@maschina/db";
import {
  DeleteAccountSchema,
  RequestDataExportSchema,
  UpdateProfileSchema,
  UpdateTrainingConsentSchema,
  assertValid,
  projectSession,
  projectUser,
  sanitizeText,
} from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// GET /users/me
app.get("/me", async (c) => {
  const { id } = c.get("user");

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new HTTPException(404, { message: "User not found" });

  return c.json(projectUser(user));
});

// PATCH /users/me
app.patch("/me", async (c) => {
  const { id } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(UpdateProfileSchema, body);

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = sanitizeText(input.name);
  if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    avatarUrl: users.avatarUrl,
    role: users.role,
    emailVerified: users.emailVerified,
    createdAt: users.createdAt,
  });

  return c.json(projectUser(updated));
});

// GET /users/me/sessions
app.get("/me/sessions", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: sessions.id,
      tokenHash: sessions.tokenHash,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  type SessionRow = (typeof rows)[number];
  return c.json(rows.map((s: SessionRow) => projectSession(s, user.sessionId ?? "")));
});

// DELETE /users/me/sessions/:id
app.delete("/me/sessions/:id", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");

  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));

  return c.json({ success: true });
});

// PATCH /users/me/training-consent
app.patch("/me/training-consent", async (c) => {
  const { id } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(UpdateTrainingConsentSchema, body);

  const { trainingConsent } = await import("@maschina/db");
  await db
    .insert(trainingConsent)
    .values({
      userId: id,
      consentGiven: input.consentGiven,
      consentVersion: input.policyVersion,
      dataFromDate: new Date(),
    })
    .onConflictDoUpdate({
      target: trainingConsent.userId,
      set: {
        consentGiven: input.consentGiven,
        consentVersion: input.policyVersion,
        revokedAt: input.consentGiven ? null : new Date(),
      },
    });

  return c.json({ success: true, consentGiven: input.consentGiven });
});

// POST /users/me/export  — GDPR Article 15
app.post("/me/export", async (c) => {
  const { id } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(RequestDataExportSchema, body);

  const { dataExportRequests } = await import("@maschina/db");
  const [request] = await db
    .insert(dataExportRequests)
    .values({
      userId: id,
      status: "pending",
      requestedAt: new Date(),
    })
    .returning({ id: dataExportRequests.id });

  // TODO: enqueue export job → packages/jobs → generates JSON/CSV → uploads to S3 → emails link

  return c.json(
    {
      success: true,
      requestId: request.id,
      message: "Export started — you'll receive an email when it's ready",
    },
    202,
  );
});

// DELETE /users/me  — GDPR Article 17, account deletion
app.delete("/me", async (c) => {
  const { id } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(DeleteAccountSchema, body);

  const { userPasswords } = await import("@maschina/db");
  const [pwRow] = await db
    .select({ passwordHash: userPasswords.passwordHash })
    .from(userPasswords)
    .where(eq(userPasswords.userId, id))
    .limit(1);

  if (!pwRow) throw new HTTPException(400, { message: "Cannot delete account" });

  const valid = await verifyPassword(input.password, pwRow.passwordHash);
  if (!valid) throw new HTTPException(401, { message: "Incorrect password" });

  // Soft delete — GDPR erasure job handles PII wipe asynchronously
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));

  await revokeAllSessions(id);

  return c.json({ success: true, message: "Account scheduled for deletion" });
});

export default app;

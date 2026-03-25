import crypto from "node:crypto";
import { hmacEmail } from "@maschina/crypto";
import {
  agents,
  and,
  count,
  db,
  eq,
  gte,
  inArray,
  isNull,
  organizationInvites,
  organizationMembers,
  organizations,
  sum,
  usageEvents,
} from "@maschina/db";
import { can, getPlan } from "@maschina/plans";
import {
  CreateOrgSchema,
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  UpdateOrgSchema,
  assertValid,
} from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

type OrgRole = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<OrgRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

async function getMembership(orgId: string, userId: string) {
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)));
  return row ?? null;
}

async function assertOrgRole(orgId: string, userId: string, minRole: OrgRole) {
  const m = await getMembership(orgId, userId);
  if (!m) throw new HTTPException(403, { message: "Not a member of this organization" });
  if (ROLE_RANK[m.role as OrgRole] < ROLE_RANK[minRole]) {
    throw new HTTPException(403, { message: `Requires ${minRole} role or above` });
  }
  return m;
}

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// ── POST /orgs ────────────────────────────────────────────────────────────────
// Create a new organization. Requires teams/enterprise/internal plan.

app.post("/", async (c) => {
  const user = c.get("user");
  if (!can.inviteTeamMembers(user.tier)) {
    throw new HTTPException(403, {
      message: "Organization management requires Mach Team plan or above",
    });
  }

  const body = await c.req.json().catch(() => null);
  const input = assertValid(CreateOrgSchema, body);

  const slug = slugify(input.name);

  const [org] = await db
    .insert(organizations)
    .values({ name: input.name, slug, avatarUrl: input.avatarUrl })
    .returning();

  // Creator becomes owner
  if (!org) throw new HTTPException(500, { message: "Failed to create organization" });

  await db.insert(organizationMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
  });

  return c.json(org, 201);
});

// ── GET /orgs ─────────────────────────────────────────────────────────────────
// List all orgs the calling user belongs to.

app.get("/", async (c) => {
  const { id: userId } = c.get("user");

  const memberships = await db
    .select({ orgId: organizationMembers.orgId, role: organizationMembers.role })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));

  if (memberships.length === 0) return c.json([]);

  const orgIds = memberships.map((m: { orgId: string; role: string }) => m.orgId);
  const roleMap = Object.fromEntries(
    memberships.map((m: { orgId: string; role: string }) => [m.orgId, m.role]),
  );

  const rows = await db
    .select()
    .from(organizations)
    .where(and(inArray(organizations.id, orgIds), isNull(organizations.deletedAt)));

  return c.json(
    rows.map((o: { id: string; [key: string]: unknown }) => ({ ...o, myRole: roleMap[o.id] })),
  );
});

// ── GET /orgs/:id ─────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "viewer");

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));

  if (!org) throw new HTTPException(404, { message: "Organization not found" });

  const [memberCount] = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId));

  return c.json({ ...org, memberCount: memberCount?.count ?? 0 });
});

// ── PATCH /orgs/:id ───────────────────────────────────────────────────────────

app.patch("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "admin");

  const body = await c.req.json().catch(() => null);
  const input = assertValid(UpdateOrgSchema, body);

  if (Object.keys(input).length === 0) {
    throw new HTTPException(400, { message: "No fields to update" });
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, orgId))
    .returning();

  return c.json(updated);
});

// ── DELETE /orgs/:id ──────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "owner");

  await db.update(organizations).set({ deletedAt: new Date() }).where(eq(organizations.id, orgId));

  return c.json({ success: true });
});

// ── GET /orgs/:id/members ─────────────────────────────────────────────────────

app.get("/:id/members", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "viewer");

  const rows = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId));

  return c.json(rows);
});

// ── PATCH /orgs/:id/members/:userId ──────────────────────────────────────────

app.patch("/:id/members/:memberId", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");
  const targetUserId = c.req.param("memberId");

  const callerMembership = await assertOrgRole(orgId, userId, "admin");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(UpdateMemberRoleSchema, body);

  if (targetUserId === userId) {
    throw new HTTPException(400, { message: "Cannot change your own role" });
  }

  const targetMembership = await getMembership(orgId, targetUserId);
  if (!targetMembership) throw new HTTPException(404, { message: "Member not found" });

  // Admins can only change members/viewers, not other admins/owners
  if (
    callerMembership.role === "admin" &&
    ROLE_RANK[targetMembership.role as OrgRole] >= ROLE_RANK.admin
  ) {
    throw new HTTPException(403, {
      message: "Admins cannot change the role of other admins or owners",
    });
  }

  // Only owners can assign the owner role
  if (input.role === "owner" && callerMembership.role !== "owner") {
    throw new HTTPException(403, { message: "Only owners can assign the owner role" });
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({ role: input.role })
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, targetUserId)))
    .returning();

  return c.json(updated);
});

// ── DELETE /orgs/:id/members/:userId ─────────────────────────────────────────

app.delete("/:id/members/:memberId", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");
  const targetUserId = c.req.param("memberId");

  // Members can remove themselves; otherwise need admin+
  if (targetUserId !== userId) {
    await assertOrgRole(orgId, userId, "admin");
  }

  const targetMembership = await getMembership(orgId, targetUserId);
  if (!targetMembership) throw new HTTPException(404, { message: "Member not found" });

  // Ensure there's at least one owner remaining
  if (targetMembership.role === "owner") {
    const [ownerCount] = await db
      .select({ count: count() })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.role, "owner")));
    if ((ownerCount?.count ?? 0) <= 1) {
      throw new HTTPException(400, {
        message: "Cannot remove the sole owner. Transfer ownership first.",
      });
    }
  }

  await db
    .delete(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, targetUserId)));

  return c.json({ success: true });
});

// ── POST /orgs/:id/invites ────────────────────────────────────────────────────

app.post("/:id/invites", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "admin");

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  if (!org) throw new HTTPException(404, { message: "Organization not found" });

  // Enforce seat limit from plan
  const plan = getPlan(c.get("user").tier);
  const currentMembers = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId));

  if (plan.maxTeamMembers !== -1 && currentMembers.length >= plan.maxTeamMembers) {
    throw new HTTPException(403, {
      message: `Seat limit reached (${plan.maxTeamMembers}). Upgrade to add more members.`,
    });
  }

  const body = await c.req.json().catch(() => null);
  const input = assertValid(InviteMemberSchema, body);

  const emailIndex = hmacEmail(input.email);

  // Check for duplicate invite
  const existing = await db
    .select()
    .from(organizationInvites)
    .where(
      and(
        eq(organizationInvites.orgId, orgId),
        eq(organizationInvites.emailIndex, emailIndex),
        isNull(organizationInvites.acceptedAt),
      ),
    );

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: "An active invite already exists for this email address",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invite] = await db
    .insert(organizationInvites)
    .values({
      orgId,
      invitedByUserId: userId,
      email: input.email, // store as-is (encrypted in prod, plaintext in dev)
      emailIndex,
      role: input.role,
      token,
      expiresAt,
    })
    .returning();

  // TODO: send invite email via @maschina/email when domain is confirmed

  return c.json({ ...invite, token }, 201);
});

// ── GET /orgs/:id/invites ─────────────────────────────────────────────────────

app.get("/:id/invites", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "admin");

  const rows = await db
    .select()
    .from(organizationInvites)
    .where(and(eq(organizationInvites.orgId, orgId), isNull(organizationInvites.acceptedAt)));

  return c.json(rows);
});

// ── DELETE /orgs/:id/invites/:inviteId ────────────────────────────────────────

app.delete("/:id/invites/:inviteId", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");
  const inviteId = c.req.param("inviteId");

  await assertOrgRole(orgId, userId, "admin");

  const [deleted] = await db
    .delete(organizationInvites)
    .where(and(eq(organizationInvites.id, inviteId), eq(organizationInvites.orgId, orgId)))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Invite not found" });

  return c.json({ success: true });
});

// ── POST /orgs/invites/:token/accept ─────────────────────────────────────────
// Public (auth required) — accept an org invite.

app.post("/invites/:token/accept", async (c) => {
  const { id: userId } = c.get("user");
  const token = c.req.param("token");

  const [invite] = await db
    .select()
    .from(organizationInvites)
    .where(eq(organizationInvites.token, token));

  if (!invite) throw new HTTPException(404, { message: "Invite not found or already used" });
  if (invite.acceptedAt) {
    throw new HTTPException(409, { message: "Invite already accepted" });
  }
  if (invite.expiresAt < new Date()) {
    throw new HTTPException(410, { message: "Invite has expired" });
  }

  // Idempotent: if already a member, just return
  const existing = await getMembership(invite.orgId, userId);
  if (!existing) {
    await db.insert(organizationMembers).values({
      orgId: invite.orgId,
      userId,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    });
  }

  await db
    .update(organizationInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(organizationInvites.id, invite.id));

  return c.json({ orgId: invite.orgId, role: invite.role });
});

// ── GET /orgs/:id/agents ──────────────────────────────────────────────────────
// List agents that belong to this org (orgId is set on the agent).

app.get("/:id/agents", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "viewer");

  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, orgId), isNull(agents.deletedAt)));

  return c.json(rows);
});

// ── GET /orgs/:id/usage ───────────────────────────────────────────────────────
// Aggregate usage across all org members for the current calendar month.

app.get("/:id/usage", async (c) => {
  const { id: userId } = c.get("user");
  const orgId = c.req.param("id");

  await assertOrgRole(orgId, userId, "admin");

  const memberRows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId));

  const memberIds = memberRows.map((m: { userId: string }) => m.userId);

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await db
    .select({
      type: usageEvents.type,
      total: sum(usageEvents.units),
      inputTokens: sum(usageEvents.inputTokens),
      outputTokens: sum(usageEvents.outputTokens),
    })
    .from(usageEvents)
    .where(and(inArray(usageEvents.userId, memberIds), gte(usageEvents.createdAt, periodStart)))
    .groupBy(usageEvents.type);

  return c.json({ orgId, period: periodStart.toISOString().slice(0, 7), breakdown: rows });
});

export default app;

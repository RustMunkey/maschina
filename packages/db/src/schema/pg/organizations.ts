import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgRoleEnum } from "./enums.js";
import { users } from "./users.js";

export const organizations = pgTable("organizations", {
  id:         uuid("id").primaryKey().defaultRandom(),
  name:       text("name").notNull(),
  slug:       text("slug").notNull().unique(),
  avatarUrl:  text("avatar_url"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt:  timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  slugIdx:      uniqueIndex("orgs_slug_idx").on(t.slug),
  deletedAtIdx: index("orgs_deleted_at_idx").on(t.deletedAt),
}));

export const organizationMembers = pgTable("organization_members", {
  id:               uuid("id").primaryKey().defaultRandom(),
  orgId:            uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role:             orgRoleEnum("role").notNull().default("member"),
  invitedByUserId:  uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  joinedAt:         timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgUserIdx:   uniqueIndex("org_members_org_user_idx").on(t.orgId, t.userId),
  userIdIdx:    index("org_members_user_id_idx").on(t.userId),
}));

export const organizationInvites = pgTable("organization_invites", {
  id:               uuid("id").primaryKey().defaultRandom(),
  orgId:            uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  invitedByUserId:  uuid("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email:            text("email").notNull(),       // encrypted
  emailIndex:       text("email_index").notNull(), // HMAC for lookup
  role:             orgRoleEnum("role").notNull().default("member"),
  token:            text("token").notNull().unique(),
  expiresAt:        timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt:       timestamp("accepted_at", { withTimezone: true }),
  createdAt:        timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx:       uniqueIndex("org_invites_token_idx").on(t.token),
  emailIndexIdx:  index("org_invites_email_index_idx").on(t.emailIndex),
  orgIdIdx:       index("org_invites_org_id_idx").on(t.orgId),
}));

export type Organization       = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvite = typeof organizationInvites.$inferSelect;

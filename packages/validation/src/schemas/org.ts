import { z } from "zod";

const ORG_ROLE = ["owner", "admin", "member", "viewer"] as const;

export const CreateOrgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name too long").trim(),
  avatarUrl: z.string().url("Invalid avatar URL").optional(),
});

export const UpdateOrgSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLE),
});

export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

import { z } from "zod";

// ─── User schemas ─────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(128).trim().optional(),
  avatarUrl: z
    .string()
    .url("Invalid URL")
    .max(2048)
    .refine((u) => u.startsWith("https://"), "Avatar URL must be HTTPS")
    .optional(),
});

export const UpdateNotificationPrefsSchema = z.object({
  emailOnAgentFailure: z.boolean().optional(),
  emailOnUsageWarning: z.boolean().optional(),
  emailOnBillingEvent: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
});

// ─── API Key schemas ──────────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name too long").trim(),
  monthlyLimit: z.number().int().positive().max(10_000_000).optional(),
  expiresAt: z
    .string()
    .datetime()
    .transform((s) => new Date(s))
    .optional(),
  environment: z.enum(["live", "test"]).default("live"),
});

// ─── Training consent ─────────────────────────────────────────────────────────

export const UpdateTrainingConsentSchema = z.object({
  consentGiven: z.boolean(),
  policyVersion: z.string().min(1),
});

// ─── Data export (GDPR Article 15) ───────────────────────────────────────────

export const RequestDataExportSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  includeAgentRuns: z.boolean().default(true),
  includeUsageHistory: z.boolean().default(true),
  includeAuditLogs: z.boolean().default(true),
});

// ─── Account deletion (GDPR Article 17) ──────────────────────────────────────

export const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password required to confirm deletion"),
  confirmPhrase: z.literal("delete my account"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type UpdateTrainingConsentInput = z.infer<typeof UpdateTrainingConsentSchema>;
export type RequestDataExportInput = z.infer<typeof RequestDataExportSchema>;
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;

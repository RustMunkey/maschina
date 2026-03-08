import { z } from "zod";

// ─── Agent schemas ────────────────────────────────────────────────────────────

const AgentTypeSchema = z.enum(["signal", "analysis", "execution", "optimization", "reporting"]);

export const CreateAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(128, "Name too long").trim(),
  description: z.string().max(1024, "Description too long").trim().optional(),
  type: AgentTypeSchema.default("signal"),
  config: z.record(z.unknown()).optional().default({}),
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(128).trim().optional(),
  description: z.string().max(1024).trim().optional(),
  config: z.record(z.unknown()).optional(),
});

export const RunAgentSchema = z.object({
  input: z.record(z.unknown()).optional().default({}),
  timeout: z
    .number()
    .int()
    .min(1_000) // 1 second minimum
    .max(3_600_000) // 1 hour maximum
    .default(300_000), // 5 minutes default
  sandboxType: z.enum(["seccomp", "seatbelt", "wasi"]).optional(),
  dryRun: z.boolean().default(false),
});

// ─── Connector schemas ────────────────────────────────────────────────────────

export const CreateConnectorSchema = z.object({
  definitionId: z.string().uuid("Invalid connector definition ID"),
  name: z.string().min(1).max(128).trim(),
  credentials: z.record(z.string()), // encrypted server-side before DB storage
});

export const UpdateConnectorSchema = z.object({
  name: z.string().min(1).max(128).trim().optional(),
  credentials: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Webhook schemas ──────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "subscription.updated",
  "usage.quota_warning",
  "usage.quota_exceeded",
] as const;

export const CreateWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "Webhook URL must be HTTPS"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "At least one event required"),
  secret: z.string().min(16, "Secret must be at least 16 characters").max(256).optional(),
  description: z.string().max(256).trim().optional(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export type RunAgentInput = z.infer<typeof RunAgentSchema>;
export type CreateConnectorInput = z.infer<typeof CreateConnectorSchema>;
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

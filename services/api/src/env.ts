import { config } from "dotenv";
import { z } from "zod";
config(); // loads .env from cwd (services/api/.env)

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  NATS_URL: z.string().default("nats://localhost:4222"),

  // JWT
  JWT_SECRET: z.string().min(32),

  // Stripe — optional in development
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional().or(z.literal("")).default(""),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional().or(z.literal("")).default(""),

  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: z.string().default("http://localhost:3001"),

  // Optional
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  API_BASE_URL: z.string().default("http://localhost:3000"),
  APP_URL: z.string().default("http://localhost:5173"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Helius — optional; if set, inbound webhook signature is verified
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
});

function parseEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${missing}`);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;

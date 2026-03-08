import { cors } from "hono/cors";
import { env } from "../env.js";

const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim());

export const corsMiddleware = cors({
  origin: (origin) => {
    if (env.NODE_ENV === "development") return origin;
    return origins.includes(origin) ? origin : origins[0];
  },
  allowHeaders:     ["Content-Type", "Authorization", "X-Request-ID"],
  allowMethods:     ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders:    ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-RateLimit-Used", "X-Quota-Type"],
  credentials:      true,
  maxAge:           86400,
});

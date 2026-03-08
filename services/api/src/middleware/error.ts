import { QuotaExceededError } from "@maschina/usage";
import { ValidationError } from "@maschina/validation";
import type { ErrorHandler } from "hono";

// ─── Global error handler ─────────────────────────────────────────────────────
// Converts typed errors from our packages into consistent HTTP responses.
// Unhandled errors become 500 with no internal details leaked to the client.

export const errorHandler: ErrorHandler = (err, c) => {
  // Validation errors (Zod parse failures)
  if (err instanceof ValidationError) {
    return c.json({ error: "validation_error", fields: err.fields }, 400);
  }

  // Quota exceeded
  if (err instanceof QuotaExceededError) {
    return c.json(
      {
        error: "quota_exceeded",
        message: err.message,
        type: err.quotaType,
        used: err.result.used,
        limit: err.result.limit,
        resetsAt: err.result.resetsAt,
      },
      429,
    );
  }

  // Known HTTP errors (thrown via Hono's HTTPException)
  if ("status" in err && typeof (err as any).status === "number") {
    const status = (err as any).status as number;
    const message = (err as any).message ?? "An error occurred";
    return c.json({ error: "http_error", message }, status as any);
  }

  // Unknown — log internally, return generic 500
  console.error("[api] Unhandled error:", err);
  return c.json({ error: "internal_error", message: "An unexpected error occurred" }, 500);
};

// ─── Not found handler ────────────────────────────────────────────────────────

export function notFound(c: any) {
  return c.json(
    { error: "not_found", message: `Route ${c.req.method} ${c.req.path} not found` },
    404,
  );
}

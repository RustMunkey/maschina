import type { ZodError, ZodType, ZodTypeDef } from "zod";

// ─── Safe parse helpers ───────────────────────────────────────────────────────
// All HTTP boundary parsing should go through here.
// Never use .parse() directly in route handlers — always use safeParse + format.

export interface ParseResult<T> {
  success: true;
  data: T;
}

export interface ParseError {
  success: false;
  errors: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export type ParseOutcome<T> = ParseResult<T> | ParseError;

/**
 * Parse and validate request body with a Zod schema.
 * Returns typed data on success, or formatted field errors on failure.
 * Never throws.
 */
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, any>, body: unknown): ParseOutcome<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodError(result.error) };
}

/**
 * Assert parse success — throws a 400-equivalent error if validation fails.
 * Use in route handlers that want to throw rather than branch.
 */
export function assertValid<T>(schema: ZodType<T, ZodTypeDef, any>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const err = new ValidationError(formatZodError(result.error));
  throw err;
}

export class ValidationError extends Error {
  readonly fields: FieldError[];
  readonly statusCode = 400;

  constructor(fields: FieldError[]) {
    super(`Validation failed: ${fields.map((f) => `${f.field}: ${f.message}`).join(", ")}`);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

function formatZodError(error: ZodError): FieldError[] {
  return error.errors.map((e) => ({
    field: e.path.join(".") || "_root",
    message: e.message,
  }));
}

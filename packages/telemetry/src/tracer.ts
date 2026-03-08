import {
  type Span,
  SpanStatusCode,
  type Tracer,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";

// ─── Tracer factory ───────────────────────────────────────────────────────────

export function getTracer(name: string): Tracer {
  return trace.getTracer(name, "0.0.0");
}

// ─── Span helpers ─────────────────────────────────────────────────────────────

/**
 * Wraps an async function in a named span.
 * Automatically records exceptions and sets error status on throw.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      span.setAttributes(attributes);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

// ─── Context propagation helpers ─────────────────────────────────────────────
// Used to pass trace context across NATS messages and HTTP headers.

export function injectTraceContext(carrier: Record<string, string>): void {
  propagation.inject(context.active(), carrier);
}

export function extractTraceContext(carrier: Record<string, string>): typeof context {
  return propagation.extract(context.active(), carrier) as any;
}

export { trace, context, SpanStatusCode };

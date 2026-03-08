import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let _sdk: NodeSDK | null = null;

// ─── Initialize OpenTelemetry ─────────────────────────────────────────────────
// Call once at service startup, before any other imports.
// OTLP_ENDPOINT should point to Grafana Alloy (or any OTel collector).

export function initTelemetry(opts: {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  enabled?: boolean;
}): void {
  const enabled = opts.enabled ?? process.env.OTEL_ENABLED !== "false";
  if (!enabled) return;

  const endpoint =
    opts.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  _sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? "0.0.0",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),

    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),

    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
      }),
      exportIntervalMillis: 30_000,
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations — enable selectively as needed
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  _sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => _sdk?.shutdown().catch(console.error));
  process.on("SIGINT", () => _sdk?.shutdown().catch(console.error));
}

export async function shutdownTelemetry(): Promise<void> {
  await _sdk?.shutdown();
  _sdk = null;
}

import {
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
  StringCodec,
  connect,
  credsAuthenticator,
} from "nats";

// ─── Connection singleton ─────────────────────────────────────────────────────

let _nc: NatsConnection | null = null;
let _js: JetStreamClient | null = null;
let _jsm: JetStreamManager | null = null;

export const sc = StringCodec();

export async function getNats(): Promise<NatsConnection> {
  if (_nc) return _nc;
  throw new Error("NATS not connected — call connectNats() first");
}

export async function getJs(): Promise<JetStreamClient> {
  if (_js) return _js;
  throw new Error("NATS not connected — call connectNats() first");
}

export async function getJsm(): Promise<JetStreamManager> {
  if (_jsm) return _jsm;
  throw new Error("NATS not connected — call connectNats() first");
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export async function connectNats(servers?: string | string[]): Promise<NatsConnection> {
  const urls = servers ?? process.env.NATS_URL ?? "nats://localhost:4222";

  // Synadia/NGS credential support.
  // Set NATS_CREDS to the raw content of your .creds file (fly secrets set NATS_CREDS="$(cat path.creds)")
  // Or NATS_CREDS_FILE to a local file path for dev.
  let authenticator: ReturnType<typeof credsAuthenticator> | undefined;
  const credContent = process.env.NATS_CREDS;
  const credFile = process.env.NATS_CREDS_FILE;
  if (credContent) {
    authenticator = credsAuthenticator(new TextEncoder().encode(credContent));
  } else if (credFile) {
    const { readFileSync } = await import("node:fs");
    authenticator = credsAuthenticator(readFileSync(credFile));
  }

  // Enable TLS when:
  //   1. NATS_TLS=true is explicitly set
  //   2. NATS_URL starts with tls:// (NGS / Synadia always uses TLS via credentials)
  const serverUrls = Array.isArray(urls) ? urls : [urls];
  const useTls =
    process.env.NATS_TLS === "true" ||
    serverUrls.some((u) => u.startsWith("tls://") || u.startsWith("wss://"));

  _nc = await connect({
    servers: urls,
    authenticator,
    tls: useTls ? {} : undefined,
    reconnect: true,
    maxReconnectAttempts: -1, // infinite retries
    reconnectTimeWait: 2000, // 2s between attempts
    pingInterval: 30_000, // 30s keepalive
    name: process.env.SERVICE_NAME ?? "maschina-service",
  });

  _js = _nc.jetstream();
  _jsm = await _nc.jetstreamManager();

  _nc.closed().then(() => {
    _nc = null;
    _js = null;
    _jsm = null;
  });

  return _nc;
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectNats(): Promise<void> {
  if (_nc) {
    await _nc.drain();
    _nc = null;
    _js = null;
    _jsm = null;
  }
}

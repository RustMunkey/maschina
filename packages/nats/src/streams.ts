import { RetentionPolicy, StorageType } from "nats";
import { getJsm } from "./client.js";

// Legacy stream names that were replaced by the consolidated EVENTS stream.
// Deleted on first boot to avoid subject-overlap errors on NGS.
const LEGACY_STREAMS = [
  "MASCHINA_AGENTS",
  "MASCHINA_BILLING",
  "MASCHINA_USAGE",
  "MASCHINA_SYSTEM",
  "MASCHINA_NOTIFICATIONS",
  "MASCHINA_USER",
];

// ─── Stream definitions ───────────────────────────────────────────────────────
// Consolidated to 2 streams to stay within NGS free tier limits.
//
// MASCHINA_EVENTS  — all domain events (agent, user, billing, usage, etc.)
//                    Limits retention, consumers filter by subject prefix.
// MASCHINA_JOBS    — agent execution job queue
//                    WorkQueue retention — each message delivered once.

export const STREAMS = {
  EVENTS: {
    name: "MASCHINA_EVENTS",
    subjects: [
      "maschina.agent.>",
      "maschina.user.>",
      "maschina.billing.>",
      "maschina.usage.>",
      "maschina.notification.>",
      "maschina.system.>",
    ],
    description: "All domain events",
  },
  JOBS: {
    name: "MASCHINA_JOBS",
    subjects: ["maschina.jobs.>"],
    description: "Agent execution job queue",
  },
} as const;

// ─── Ensure streams exist ─────────────────────────────────────────────────────

export async function ensureStreams(): Promise<void> {
  const jsm = await getJsm();

  // Remove legacy streams that would cause subject-overlap errors.
  for (const name of LEGACY_STREAMS) {
    try {
      await jsm.streams.delete(name);
    } catch {
      // Stream doesn't exist — that's fine.
    }
  }

  const configs = [
    {
      name: STREAMS.EVENTS.name,
      subjects: [...STREAMS.EVENTS.subjects],
      storage: StorageType.File,
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
      max_msgs: 1_000_000,
      max_bytes: 64 * 1024 * 1024, // 64 MB
      num_replicas: 1,
    },
    {
      name: STREAMS.JOBS.name,
      subjects: [...STREAMS.JOBS.subjects],
      storage: StorageType.File,
      retention: RetentionPolicy.Workqueue,
      max_age: 24 * 60 * 60 * 1_000_000_000, // 24h — jobs expire if not consumed
      max_msgs: 100_000,
      max_bytes: 16 * 1024 * 1024, // 16 MB
      num_replicas: 1,
    },
  ];

  for (const cfg of configs) {
    try {
      await jsm.streams.add(cfg);
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.includes("stream name already in use")) {
        await jsm.streams.update(cfg.name, { subjects: cfg.subjects });
      } else if (msg.includes("subjects overlap")) {
        // A legacy stream claims these subjects — purge it and retry.
        for await (const s of jsm.streams.list()) {
          const overlaps = (s.config.subjects ?? []).some((sub) =>
            cfg.subjects.some((cs) => sub === cs || sub.startsWith(cs.replace(">", "")) || cs.startsWith(sub.replace(">", "")))
          );
          if (overlaps && s.config.name !== cfg.name) {
            await jsm.streams.delete(s.config.name);
          }
        }
        await jsm.streams.add(cfg);
      } else {
        throw err;
      }
    }
  }
}

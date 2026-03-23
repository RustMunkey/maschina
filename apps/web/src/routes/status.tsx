import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

const SERVICES = [
  { name: "API",               desc: "api.maschina.dev",         status: "operational" },
  { name: "Gateway",           desc: "Routing + auth layer",     status: "operational" },
  { name: "Agent runtime",     desc: "Execution nodes",          status: "operational" },
  { name: "Realtime",          desc: "WebSocket / SSE",          status: "operational" },
  { name: "Marketplace",       desc: "Agent registry",           status: "operational" },
  { name: "Dashboard",         desc: "app.maschina.dev",         status: "operational" },
  { name: "Billing",           desc: "Stripe integration",       status: "operational" },
  { name: "NATS",              desc: "Job queue / messaging",    status: "operational" },
];

const STATUS_COLOR: Record<string, string> = {
  operational:  "#22c55e",
  degraded:     "#f59e0b",
  outage:       "#F84242",
};

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  degraded:    "Degraded",
  outage:      "Outage",
};

function StatusPage() {
  const allOk = SERVICES.every((s) => s.status === "operational");

  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24">
        <ScrambleText text="SYSTEM STATUS" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <div className="flex items-center gap-4 mb-6">
          <div className="h-3 w-3 rounded-full" style={{ background: allOk ? "#22c55e" : "#F84242", boxShadow: `0 0 8px ${allOk ? "#22c55e" : "#F84242"}` }} />
          <h1 className="text-4xl font-bold tracking-tight text-white">
            {allOk ? "All systems operational." : "Service disruption detected."}
          </h1>
        </div>
        <p className="text-base text-white/40">
          Last updated: just now
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-16">
        <ScrambleText text="SERVICES" className="text-xs text-white/30 tracking-widest uppercase mb-8 block" />
        <div className="flex flex-col gap-2">
          {SERVICES.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between px-6 py-4 rounded-xl border border-white/[0.08]"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.05) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-white">{s.name}</span>
                <span className="text-xs text-white/30">{s.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s.status] }} />
                <span className="text-xs" style={{ color: STATUS_COLOR[s.status] }}>{STATUS_LABEL[s.status]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-16">
        <ScrambleText text="INCIDENT HISTORY" className="text-xs text-white/30 tracking-widest uppercase mb-8 block" />
        <p className="text-sm text-white/30">No incidents in the last 90 days.</p>
      </div>

      <Footer />
    </main>
  );
}

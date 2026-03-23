import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/safety")({
  component: SafetyPage,
});

const PRINCIPLES = [
  {
    title: "Human oversight, always",
    body: "Agents on Maschina operate within explicit boundaries set by developers. No agent can escalate its own permissions or modify its own constraints without explicit re-authorization.",
  },
  {
    title: "Transparent execution",
    body: "Every agent run is logged, traceable, and auditable. Developers can inspect inputs, outputs, and the full execution path of any run — past or present.",
  },
  {
    title: "Abuse prevention at the network level",
    body: "Nodes and developers are subject to rate limits, content policies, and behavioral monitoring. Repeat violations result in removal from the network.",
  },
  {
    title: "No silent failures",
    body: "We surface errors, policy violations, and anomalies explicitly. Agents that fail do so loudly — with full context — so humans can intervene.",
  },
  {
    title: "Responsible model access",
    body: "Access to more capable models is gated on plan tier and usage history. We don't hand Opus to anonymous free-tier users running unreviewed agents.",
  },
  {
    title: "Open about limitations",
    body: "We don't claim Maschina is safe by default. We provide the tools for developers to build safely. The responsibility is shared — we document where our safety layer ends.",
  },
];

function SafetyPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-4xl">
        <ScrambleText text="SAFETY" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Autonomous doesn't mean unchecked.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          We're building infrastructure for agents that act in the world. That responsibility shapes every decision we make — from API design to network policy.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="PRINCIPLES" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {PRINCIPLES.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-base font-semibold text-white">{p.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="REPORTING" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <div className="grid grid-cols-2 gap-24 items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">See something unsafe?</h2>
            <p className="text-base text-white/40 leading-relaxed">
              If you observe an agent or node behaving in a way that poses a safety risk, report it directly. We take every report seriously and respond within 24 hours.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a href="mailto:safety@maschina.ai" className="text-sm text-white/50 hover:text-white/80 transition-colors border border-white/10 hover:border-white/20 rounded-lg px-6 py-3 text-center">
              safety@maschina.ai
            </a>
            <a href="/security" className="text-sm text-white/30 hover:text-white/60 transition-colors text-center">
              Security disclosures →
            </a>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

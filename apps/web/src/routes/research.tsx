import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/research")({
  component: ResearchPage,
});

const AREAS = [
  {
    title: "Distributed execution",
    body: "How do you route agentic workloads across heterogeneous nodes — different hardware, models, and latency profiles — while maintaining correctness and low overhead?",
  },
  {
    title: "Verifiable compute",
    body: "Cryptographic techniques for proving that a node executed a task faithfully without re-running the full computation. Foundation for trustless settlement.",
  },
  {
    title: "Agent scheduling",
    body: "Scheduling algorithms that account for model availability, GPU memory, network position, and historical reliability — not just load balancing.",
  },
  {
    title: "Economic mechanism design",
    body: "Incentive structures for a two-sided network. How do you price execution, reward good nodes, penalize bad ones, and prevent gaming?",
  },
  {
    title: "Privacy-preserving inference",
    body: "Running agent workloads on untrusted compute without exposing user data or model weights. Encrypted payloads, TEEs, and related approaches.",
  },
  {
    title: "Agentic systems reliability",
    body: "What does fault tolerance look like when the unit of work is a multi-step autonomous agent rather than a stateless function call?",
  },
];

function ResearchPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-4xl">
        <ScrambleText text="RESEARCH" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Hard problems worth solving.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          Maschina is built on open questions. We publish our thinking as we go.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="RESEARCH AREAS" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {AREAS.map((a) => (
            <div
              key={a.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-base font-semibold text-white">{a.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{a.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 flex items-center justify-between">
        <div>
          <ScrambleText text="PUBLICATIONS" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
          <h2 className="text-2xl font-bold text-white mb-3">Papers and writing coming soon.</h2>
          <p className="text-base text-white/40 max-w-md">
            We're working on formalizing several of these areas. Reach out if you want to collaborate.
          </p>
        </div>
        <a
          href="mailto:team@maschina.ai?subject=Research collaboration"
          className="shrink-0 ml-16 inline-flex items-center gap-2 text-sm px-8 py-3 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
        >
          Collaborate <ArrowUpRight size={14} />
        </a>
      </div>

      <Footer />
    </main>
  );
}

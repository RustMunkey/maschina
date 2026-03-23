import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight, FilePdf } from "@phosphor-icons/react";

export const Route = createFileRoute("/whitepaper")({
  component: WhitepaperPage,
});

const SECTIONS = [
  { title: "Network architecture",    body: "How nodes join, how jobs are dispatched, and how the execution layer is structured." },
  { title: "Economic model",          body: "Revenue split, credit system, staking, and how value flows between developers, nodes, and the treasury." },
  { title: "Scheduling algorithm",    body: "How Maschina selects nodes — load, model availability, reputation, latency, and GPU scoring." },
  { title: "Settlement layer",        body: "On-chain receipts, escrow, and Solana integration for verifiable, trustless settlement." },
  { title: "Security model",          body: "Encrypted payloads, key management, access control, and the threat model we design against." },
  { title: "Roadmap",                 body: "What's built, what's next, and the open research questions we're working through." },
];

function WhitepaperPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="WHITEPAPER" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Technical architecture and economic design.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          The full technical specification for the Maschina network — how it works, why it's designed this way, and what the open questions are.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="CONTENTS" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {SECTIONS.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-sm font-semibold text-white">{s.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 flex items-center justify-between">
        <div className="flex items-start gap-6">
          <div className="mt-1 p-4 rounded-xl border border-white/[0.08]" style={{ background: "rgba(255,255,255,0.02)" }}>
            <FilePdf size={28} className="text-white/30" />
          </div>
          <div>
            <p className="text-sm text-white/30 mb-1">Maschina Whitepaper — v0.1 draft</p>
            <h2 className="text-2xl font-bold text-white mb-2">In progress.</h2>
            <p className="text-base text-white/40 max-w-md">
              We're formalizing the technical specification now. Request early access and we'll send it when it's ready.
            </p>
          </div>
        </div>
        <a
          href="mailto:team@maschina.ai?subject=Whitepaper Request"
          className="shrink-0 ml-16 inline-flex items-center gap-2 text-sm px-8 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
        >
          Request access <ArrowUpRight size={14} />
        </a>
      </div>

      <Footer />
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/press-kit")({
  component: PressKitPage,
});

const BOILERPLATE = `Maschina is a distributed execution network for AI agents. Developers deploy agents through a single API and CLI — Maschina handles routing, execution, billing, and settlement across a global network of nodes. Node runners contribute compute and earn on every job routed their way. Maschina is built on the principle that the infrastructure for autonomous AI should be open, distributed, and economically fair.`;

function PressKitPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="PRESS KIT" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Everything press needs.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          Logos, boilerplate, background, and contact. If you're writing about Maschina, start here.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 grid grid-cols-2 gap-24">
        <div>
          <ScrambleText text="BOILERPLATE" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <p className="text-base text-white/50 leading-relaxed border-l-2 pl-5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            {BOILERPLATE}
          </p>
        </div>
        <div className="flex flex-col gap-10">
          <div>
            <ScrambleText text="CONTACT" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
            <p className="text-sm text-white/40 mb-4">For press inquiries, interview requests, and embargoed briefings.</p>
            <a href="mailto:team@maschina.ai?subject=Press inquiry" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors">
              team@maschina.ai <ArrowUpRight size={13} />
            </a>
          </div>
          <div>
            <ScrambleText text="ASSETS" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
            <p className="text-sm text-white/40 mb-4">Logo files, screenshots, and founder photos available on request.</p>
            <a href="mailto:team@maschina.ai?subject=Press assets" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors">
              Request assets <ArrowUpRight size={13} />
            </a>
          </div>
          <div>
            <ScrambleText text="COVERAGE" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
            <p className="text-sm text-white/30">No published coverage yet. Check back soon.</p>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

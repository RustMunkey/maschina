import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight, FilePdf } from "@phosphor-icons/react";

export const Route = createFileRoute("/one-pager")({
  component: OnePagerPage,
});

function OnePagerPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="ONE-PAGER" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Everything you need to know. One page.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          The short version — what Maschina is, who it's for, and why it matters. Built for people who don't have time for the full deck.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 flex items-center justify-between">
        <div className="flex items-start gap-6">
          <div className="mt-1 p-4 rounded-xl border border-white/[0.08]" style={{ background: "rgba(255,255,255,0.02)" }}>
            <FilePdf size={28} className="text-white/30" />
          </div>
          <div>
            <p className="text-sm text-white/30 mb-1">Maschina — One-pager</p>
            <h2 className="text-2xl font-bold text-white mb-2">Available on request.</h2>
            <p className="text-base text-white/40 max-w-md">
              Drop us an email and we'll send it over.
            </p>
          </div>
        </div>
        <a
          href="mailto:team@maschina.ai?subject=One-pager Request"
          className="shrink-0 ml-16 inline-flex items-center gap-2 text-sm px-8 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
        >
          Request <ArrowUpRight size={14} />
        </a>
      </div>

      <Footer />
    </main>
  );
}

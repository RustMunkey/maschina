import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const DOCS = [
  {
    title: "Whitepaper",
    description: "Technical architecture, network design, and the economic model behind Maschina.",
    href: "/whitepaper",
  },
  {
    title: "Pitch Deck",
    description: "A high-level overview of the opportunity, the product, and where we're going.",
    href: "/pitch-deck",
  },
  {
    title: "One-pager",
    description: "The short version. One page, everything you need to know.",
    href: "/one-pager",
  },
];

function AboutPage() {
  return (
    <main className="pt-16 overflow-x-hidden">

      {/* Hero */}
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="ABOUT" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Infrastructure for autonomous digital labor.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          Maschina is a decentralized network that lets anyone contribute compute and earn — while giving developers a single interface to deploy, run, and scale AI agents globally. We believe the future of work is autonomous, and the infrastructure that powers it should be open, distributed, and owned by the people who run it.
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Vision */}
      <div className="px-28 py-24 grid grid-cols-2 gap-24">
        <div>
          <ScrambleText text="MISSION" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <p className="text-2xl font-medium text-white leading-snug pl-5" style={{ borderLeft: "2px solid #F84242" }}>
            Make autonomous agents accessible to every developer and profitable for every node runner.
          </p>
        </div>
        <div>
          <ScrambleText text="VISION" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <p className="text-base text-white/50 leading-relaxed">
            A world where idle compute doesn't go to waste. Where a developer in Lagos can deploy an agent that runs on a machine in Montreal in under a second. Where the infrastructure is transparent, the economics are fair, and no single company controls the network.
          </p>
          <p className="text-base text-white/50 leading-relaxed mt-4">
            That's Maschina. Uber and Airbnb built platforms that extracted value from workers. We're building one that distributes it.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Documents */}
      <div className="px-28 py-24">
        <ScrambleText text="DOCUMENTS" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {DOCS.map((doc) => (
            <a
              key={doc.title}
              href={doc.href}
              className="group relative rounded-xl border border-white/[0.08] p-7 flex flex-col gap-4 hover:border-white/15 transition-all"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-white">{doc.title}</h3>
                <ArrowUpRight size={16} className="text-white/20 group-hover:text-white/50 transition-colors mt-0.5" />
              </div>
              <p className="text-sm text-white/40 leading-relaxed">{doc.description}</p>
            </a>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  );
}

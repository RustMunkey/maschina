import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/marketplace")({
  component: MarketplacePage,
});

const CATEGORIES = [
  {
    label: "Automation",
    description: "Agents that handle repetitive tasks — scheduling, data entry, notifications, and workflows.",
    count: null,
  },
  {
    label: "Research",
    description: "Deep-search agents that synthesize information from the web, documents, and APIs.",
    count: null,
  },
  {
    label: "Code",
    description: "Code review, generation, refactoring, and test-writing agents built for engineering teams.",
    count: null,
  },
  {
    label: "Data",
    description: "ETL pipelines, analysis, and transformation agents that run on your schedule.",
    count: null,
  },
  {
    label: "Customer",
    description: "Support, onboarding, and engagement agents trained on your product knowledge.",
    count: null,
  },
  {
    label: "Finance",
    description: "Agents for reconciliation, reporting, fraud signals, and market intelligence.",
    count: null,
  },
];

const HOW = [
  {
    step: "01",
    title: "Build an agent",
    body: "Define your agent using any model — Claude, GPT, Llama, or your own. Configure inputs, outputs, and runtime behavior.",
  },
  {
    step: "02",
    title: "Publish to the marketplace",
    body: "Set a price per run or a monthly subscription. Maschina handles billing, routing, and infrastructure.",
  },
  {
    step: "03",
    title: "Earn on every execution",
    body: "You receive 65% of every run your agent completes. The network handles the rest — compute, settlement, verification.",
  },
];

function MarketplacePage() {
  return (
    <main className="pt-16 overflow-x-hidden">

      {/* Hero */}
      <div className="px-28 pt-20 pb-24 max-w-4xl">
        <ScrambleText text="MARKETPLACE" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Deploy agents.<br />Earn on every run.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          The Maschina Marketplace is where developers publish agents and users discover them. Every agent runs on distributed infrastructure, billed by execution, settled on-chain.
        </p>
        <div className="flex items-center gap-4 mt-10">
          <a
            href="mailto:team@maschina.ai"
            className="inline-flex items-center gap-2 text-sm px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
          >
            Request early access
          </a>
          <a
            href="https://docs.maschina.dev"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Read the docs <ArrowUpRight size={14} />
          </a>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* How it works */}
      <div className="px-28 py-24">
        <ScrambleText text="HOW IT WORKS" className="text-xs text-white/30 tracking-widest uppercase mb-14 block" />
        <div className="grid grid-cols-3 gap-12">
          {HOW.map((item) => (
            <div key={item.step} className="flex flex-col gap-5">
              <span className="text-xs font-mono" style={{ color: "#F84242" }}>{item.step}</span>
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Categories */}
      <div className="px-28 py-24">
        <ScrambleText text="CATEGORIES" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.label}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-base font-semibold text-white">{cat.label}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{cat.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Economics callout */}
      <div className="px-28 py-24 grid grid-cols-2 gap-24 items-center">
        <div>
          <ScrambleText text="REVENUE SHARE" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <h2 className="text-3xl font-bold text-white leading-snug mb-6">
            65% to the developer.<br />Not the platform.
          </h2>
          <p className="text-base text-white/40 leading-relaxed">
            Most platforms take 30–50% of every transaction. Maschina takes 20% — split between the treasury and network validators. The developer keeps 65%. Node operators who run your agent earn the rest.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { label: "Developer", pct: "65%", color: "" },
            { label: "Node operators", pct: "10%", color: "bg-white/30" },
            { label: "Treasury", pct: "20%", color: "bg-white/15" },
            { label: "Validators", pct: "5%", color: "bg-white/8" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-4">
              <div
                className={`h-1.5 rounded-full ${row.color}`}
                style={{ width: row.pct, background: row.label === "Developer" ? "#F84242" : undefined }}
              />
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-white/60 shrink-0">{row.pct}</span>
                <span className="text-sm text-white/30">{row.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  );
}

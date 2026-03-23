import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/developers")({
  component: DevelopersPage,
});

const FEATURES = [
  {
    title: "Single API, any model",
    body: "Route to Claude, GPT, Llama, or your own fine-tuned model through one endpoint. Cascade fallback is built in.",
  },
  {
    title: "Run anywhere",
    body: "Agents execute on distributed nodes — home machines, cloud VMs, GPU servers. No infra to manage.",
  },
  {
    title: "Built-in observability",
    body: "Every run is logged, traced, and auditable. Full input/output history, latency, and cost breakdown.",
  },
  {
    title: "Webhook integrations",
    body: "Fire webhooks on run start, completion, or failure. Chain agents together or trigger downstream systems.",
  },
  {
    title: "Billing by execution",
    body: "Pay per run or subscribe. Transparent credit system — no surprise invoices, no minimum commitments.",
  },
  {
    title: "Publish to marketplace",
    body: "Ship your agent to the marketplace in one command. Earn 65% of every execution, settled automatically.",
  },
];

const QUICKSTART = `# Install the CLI
curl -fsSL https://maschina.dev/install.sh | sh

# Authenticate
maschina auth login

# Initialize a project
maschina init my-agent

# Run your agent
maschina agent run my-agent --input '{"query": "..."}'`;

const SDK = `import Maschina from "@maschina/sdk";

const client = new Maschina({ apiKey: process.env.MASCHINA_API_KEY });

const run = await client.agents.run("my-agent", {
  input: { query: "Summarize the latest AI papers" },
});

console.log(run.output);`;

function MarkerCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3" style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{body}</p>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        </div>
        <span className="text-xs text-white/20 ml-2 font-mono">{label}</span>
      </div>
      <pre className="p-6 text-sm text-white/60 font-mono leading-relaxed overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function DevelopersPage() {
  return (
    <main className="pt-16 overflow-x-hidden">

      {/* Hero */}
      <div className="px-28 pt-20 pb-24 max-w-4xl">
        <ScrambleText text="DEVELOPERS" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Build agents.<br />Ship globally.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          Maschina gives developers a CLI, SDK, and API to build, run, and monetize AI agents on a distributed network. From prototype to production in minutes.
        </p>
        <div className="flex items-center gap-4 mt-10">
          <a
            href="https://docs.maschina.dev"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
          >
            Read the docs <ArrowUpRight size={14} />
          </a>
          <a
            href="mailto:team@maschina.ai"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Join the beta
          </a>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Code examples */}
      <div className="px-28 py-24 grid grid-cols-2 gap-8">
        <CodeBlock code={QUICKSTART} label="Terminal" />
        <CodeBlock code={SDK} label="TypeScript SDK" />
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Features */}
      <div className="px-28 py-24">
        <ScrambleText text="PLATFORM" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <MarkerCard key={f.title} {...f} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* CTA */}
      <div className="px-28 py-24 flex items-center justify-between">
        <div>
          <ScrambleText text="GET STARTED" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
          <h2 className="text-3xl font-bold text-white mb-3">Ready to build?</h2>
          <p className="text-base text-white/40 max-w-md">
            The CLI and SDK are in private beta. Join the waitlist and we'll get you set up.
          </p>
        </div>
        <div className="flex flex-col gap-3 shrink-0 ml-16">
          <a
            href="mailto:team@maschina.ai"
            className="inline-flex items-center justify-center gap-2 text-sm px-8 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
          >
            Request access
          </a>
          <a
            href="https://docs.maschina.dev"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Browse docs <ArrowUpRight size={14} />
          </a>
        </div>
      </div>

      <Footer />
    </main>
  );
}

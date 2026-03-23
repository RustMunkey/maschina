import { createFileRoute } from "@tanstack/react-router";
import { Diagram } from "../components/mdx/index.js";

const BANNER = `███╗   ███╗ █████╗ ███████╗ ██████╗██╗  ██╗██╗███╗   ██╗ █████╗
████╗ ████║██╔══██╗██╔════╝██╔════╝██║  ██║██║████╗  ██║██╔══██╗
██╔████╔██║███████║███████╗██║     ███████║██║██╔██╗ ██║███████║
██║╚██╔╝██║██╔══██║╚════██║██║     ██╔══██║██║██║╚██╗██║██╔══██║
██║ ╚═╝ ██║██║  ██║███████║╚██████╗██║  ██║██║██║ ╚████║██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝`;

export const Route = createFileRoute("/introduction")({
  component: function Introduction() {
    return (
      <div>
        <pre style={{ color: "rgba(255,255,255,0.15)", fontSize: "1rem", lineHeight: "1.2", fontFamily: "monospace", whiteSpace: "pre", width: "max-content", maxWidth: "calc(100vw - 24rem)", marginBottom: "3rem" }}>
          {BANNER}
        </pre>

        <h1 style={{ fontFamily: "Sohne, sans-serif" }} className="text-3xl text-white mt-0 mb-4 tracking-tight">
          Infrastructure for autonomous digital labor.
        </h1>

        <p className="text-white/60 leading-7 mb-8 text-sm max-w-xl">
          Maschina is a distributed agentic network that connects AI workloads to the compute that runs them — across any machine, anywhere. Idle hardware earns. Developers ship. Agents run.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-12 max-w-xl">
          {[
            { label: "Quickstart", desc: "Deploy your first agent in under five minutes.", href: "/quickstart" },
            { label: "Concepts", desc: "Understand agents, nodes, runs, and routing.", href: "/concepts" },
            { label: "CLI", desc: "Install and use the maschina binary.", href: "/guides/cli" },
            { label: "API Reference", desc: "Full REST and realtime API documentation.", href: "/api-reference/authentication" },
          ].map((card) => (
            <a
              key={card.label}
              href={card.href}
              className="block rounded-lg border border-white/8 px-5 py-4 hover:border-white/15 hover:bg-white/[0.02] transition-colors group"
            >
              <p style={{ fontFamily: "Sohne, sans-serif" }} className="text-sm text-white mb-1 group-hover:text-[#F84242] transition-colors">{card.label}</p>
              <p className="text-xs text-white/40 leading-relaxed">{card.desc}</p>
            </a>
          ))}
        </div>

        <h2 style={{ fontFamily: "Sohne, sans-serif" }} className="text-xl text-white mt-10 mb-4 tracking-tight">
          What is Maschina?
        </h2>
        <p className="text-white/60 leading-7 mb-4 text-sm max-w-xl">
          Maschina is a peer-to-peer network for running AI agents on distributed compute. Anyone with a machine can contribute capacity to the network and earn from it. Developers submit agent runs through the API or CLI — the network routes them to available nodes, executes them, and streams results back in real time.
        </p>
        <p className="text-white/60 leading-7 mb-4 text-sm max-w-xl">
          There is no central GPU cluster. The network is the infrastructure.
        </p>

        <h2 style={{ fontFamily: "Sohne, sans-serif" }} className="text-xl text-white mt-10 mb-4 tracking-tight">
          How it works
        </h2>
        <p className="text-white/60 leading-7 mb-6 text-sm max-w-xl">
          When you submit an agent run, it enters the job queue. The scheduler scores available nodes by load, model availability, hardware tier, and reputation, then dispatches the job over NATS. The node executes the agent in an isolated runtime and streams output back through the realtime layer to your client.
        </p>
        <Diagram
          nodes={[
            { id: "client",   label: "Client",    x: 10,  y: 152, accent: true },
            { id: "gateway",  label: "Gateway",   x: 175, y: 152 },
            { id: "api",      label: "API",        x: 340, y: 152 },
            { id: "nats",     label: "NATS",       x: 340, y: 62  },
            { id: "daemon",   label: "Daemon",     x: 505, y: 62  },
            { id: "runtime",  label: "Runtime",    x: 505, y: 152 },
            { id: "realtime", label: "Realtime",   x: 505, y: 242 },
            { id: "out",      label: "Client",     x: 665, y: 152, accent: true },
          ]}
          edges={[
            { from: "client",   to: "gateway"  },
            { from: "gateway",  to: "api"      },
            { from: "api",      to: "nats"     },
            { from: "nats",     to: "daemon"   },
            { from: "daemon",   to: "runtime"  },
            { from: "runtime",  to: "realtime" },
            { from: "realtime", to: "out"      },
          ]}
        />
        <p className="text-white/60 leading-7 mb-4 text-sm max-w-xl">
          Settlement happens on Solana — node operators receive payment automatically when a run completes and is verified.
        </p>

        <h2 style={{ fontFamily: "Sohne, sans-serif" }} className="text-xl text-white mt-10 mb-4 tracking-tight">
          Stack
        </h2>
        <ul className="list-disc pl-5 text-white/60 text-sm mb-4 space-y-1.5 max-w-xl">
          <li className="leading-7"><span className="text-white/80">API</span> — Hono on Node.js, JWT auth, Stripe billing</li>
          <li className="leading-7"><span className="text-white/80">Gateway</span> — Rust / Axum, request routing and verification</li>
          <li className="leading-7"><span className="text-white/80">Runtime</span> — Python / FastAPI, agent execution and sandboxing</li>
          <li className="leading-7"><span className="text-white/80">Realtime</span> — Rust / Axum, WebSocket and SSE fanout</li>
          <li className="leading-7"><span className="text-white/80">Messaging</span> — NATS JetStream for job dispatch</li>
          <li className="leading-7"><span className="text-white/80">Chain</span> — Solana for settlement and node reputation</li>
        </ul>
      </div>
    );
  },
});

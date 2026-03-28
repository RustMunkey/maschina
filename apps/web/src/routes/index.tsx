import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DownloadSimple } from "@phosphor-icons/react";
import { SiGithub, SiX, SiDiscord } from "@icons-pack/react-simple-icons";
import Silk from "../components/Silk";
import { ScrambleText } from "../components/ScrambleText";
import { Footer } from "../components/Footer";

// prefix, target number, decimals, suffix
function CountUp({ prefix = "", to, decimals = 0, suffix = "", duration = 1800 }: {
  prefix?: string; to: number; decimals?: number; suffix?: string; duration?: number;
}) {
  const [val, setVal] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);

  const animate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    let start: number | null = null;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min((now - start) / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(parseFloat((eased * to).toFixed(decimals)));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [to, decimals, duration]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) animate();
        else { cancelAnimationFrame(rafRef.current); setVal(0); }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [animate]);

  return (
    <span ref={spanRef}>
      {prefix}{val.toFixed(decimals)}{suffix}
    </span>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});

const tabs = ["Home", "Network", "Marketplace", "Agents"];

const ASCII_LOGO = `                                             /##       /##
                                            | ##      |__/
 /######/####   /######   /#######  /#######| #######  /## /#######   /######
| ##_  ##_  ## |____  ## /##_____/ /##_____/| ##__  ##| ##| ##__  ## |____  ##
| ## \\ ## \\ ##  /#######|  ###### | ##      | ##  \\ ##| ##| ##  \\ ##  /#######
| ## | ## | ## /##__  ## \\____  ##| ##      | ##  | ##| ##| ##  | ## /##__  ##
| ## | ## | ##|  ####### /#######/|  #######| ##  | ##| ##| ##  | ##|  #######
|__/ |__/ |__/ \\_______/|_______/  \\_______/|__/  |__/|__/|__/  |__/ \\_______/`;

function TerminalBody({ tab }: { tab: string }) {
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  if (tab === "Home") {
    return (
      <div className="flex flex-col items-center px-16 pt-10 pb-6 h-[460px]" style={mono}>
        <pre className="text-[5.5px] leading-[1.4] text-white/60 select-none mb-10 overflow-hidden">{ASCII_LOGO}</pre>
        <div className="flex gap-12">
          <div className="flex flex-col gap-1.5">
            {[
              { label: "run",      active: true  },
              { label: "agents",   active: false },
              { label: "models",   active: false },
              { label: "usage",    active: false },
              { label: "settings", active: false },
              { label: "logout",   active: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-3 text-sm leading-none text-white/80 flex items-center">{item.active ? "•" : ""}</span>
                <span className={`text-xs ${item.active ? "text-white font-bold" : "text-white/40"}`}>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              { desc: "send a prompt to the network", active: true  },
              { desc: "manage your deployed agents",  active: false },
              { desc: "configure model providers",    active: false },
              { desc: "quota and billing",            active: false },
              { desc: "preferences",                  active: false },
              { desc: "sign out",                     active: false },
            ].map((item, i) => (
              <div key={i} className={`text-xs ${item.active ? "text-white" : "text-white/25"}`}>{item.desc}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (tab === "Network") {
    return (
      <div className="flex flex-col px-16 pt-10 pb-6 h-[460px]" style={mono}>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-8">network status</p>
        <div className="grid grid-cols-2 gap-x-16 gap-y-5 mb-10">
          {[
            { label: "nodes online",     value: "2,841"    },
            { label: "jobs last 24h",    value: "148,302"  },
            { label: "avg latency",      value: "38ms"     },
            { label: "avg node uptime",  value: "99.2%"    },
            { label: "regions",          value: "12"       },
            { label: "network load",     value: "41%"      },
          ].map((stat) => (
            <div key={stat.label} className="flex justify-between gap-8">
              <span className="text-xs text-white/30">{stat.label}</span>
              <span className="text-xs text-white/80">{stat.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/20 mb-3">recent activity</p>
        <div className="flex flex-col gap-2">
          {[
            { node: "node-sf-02",  job: "researcher",  time: "2s ago",  status: "completed" },
            { node: "node-eu-07",  job: "summarizer",  time: "5s ago",  status: "completed" },
            { node: "node-ap-11",  job: "coder",       time: "12s ago", status: "running"   },
            { node: "node-us-03",  job: "analyst",     time: "18s ago", status: "completed" },
          ].map((row, i) => (
            <div key={i} className="flex gap-6 text-xs">
              <span className="text-white/25 w-24">{row.node}</span>
              <span className="text-white/50 w-24">{row.job}</span>
              <span className="text-white/20 w-16">{row.time}</span>
              <span className={row.status === "running" ? "text-green-400/60" : "text-white/20"}>{row.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "Marketplace") {
    return (
      <div className="flex flex-col px-16 pt-10 pb-6 h-[460px]" style={mono}>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-8">marketplace</p>
        <div className="flex flex-col gap-4">
          {[
            { name: "researcher",  author: "maschina",   runs: "84.2k", desc: "deep research + source synthesis"   },
            { name: "coder",       author: "maschina",   runs: "61.7k", desc: "write, review, and refactor code"   },
            { name: "summarizer",  author: "0xdeadbeef", runs: "32.1k", desc: "compress long documents to bullets" },
            { name: "analyst",     author: "drift_labs", runs: "18.9k", desc: "financial and data analysis"        },
            { name: "translator",  author: "polyglot",   runs: "12.4k", desc: "high-fidelity multilingual output"  },
          ].map((agent, i) => (
            <div key={i} className="flex items-baseline gap-6">
              <span className="text-xs text-white/80 w-24">{agent.name}</span>
              <span className="text-xs text-white/25 w-28">{agent.author}</span>
              <span className="text-xs text-white/20 w-16">{agent.runs} runs</span>
              <span className="text-xs text-white/20">{agent.desc}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "Agents") {
    return (
      <div className="flex flex-col px-16 pt-10 pb-6 h-[460px]" style={mono}>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-8">your agents</p>
        <div className="flex flex-col gap-4">
          {[
            { name: "researcher",  status: "active",  model: "claude-sonnet-4-6", lastRun: "2m ago"  },
            { name: "coder",       status: "active",  model: "claude-opus-4-6",   lastRun: "1h ago"  },
            { name: "summarizer",  status: "idle",    model: "claude-haiku-4-5",  lastRun: "3h ago"  },
            { name: "data-pipe",   status: "idle",    model: "gpt-5",             lastRun: "1d ago"  },
            { name: "monitor",     status: "stopped", model: "claude-haiku-4-5",  lastRun: "4d ago"  },
          ].map((agent, i) => (
            <div key={i} className="flex items-baseline gap-6">
              <span className="text-xs text-white/80 w-24">{agent.name}</span>
              <span className={`text-xs w-16 ${agent.status === "active" ? "text-green-400/60" : agent.status === "idle" ? "text-white/30" : "text-white/15"}`}>{agent.status}</span>
              <span className="text-xs text-white/25 w-40">{agent.model}</span>
              <span className="text-xs text-white/20">{agent.lastRun}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function HomePage() {
  const [activeTab, setActiveTab] = useState("Home");
  const [blockFocused, setBlockFocused] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (blockRef.current && !blockRef.current.contains(e.target as Node)) {
        setBlockFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <main className="pt-16">

      {/* Hero text */}
      <div className="relative px-28 flex flex-col items-start pt-12 pb-12">
        <ScrambleText text="THE AGENTIC NETWORK" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight mb-6 text-white">
          Build agents. The network runs them.
        </h1>
        <p className="max-w-sm text-base text-white/50 leading-relaxed mb-8">
          Maschina is the distributed execution layer for AI agents — deploy globally, earn from every run, and never touch a server.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="/download"
            className="inline-flex items-center gap-2 bg-white text-black text-sm font-medium rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
          >
            <DownloadSimple size={16} weight="bold" />
            Download CLI
          </a>
          <a
            href="https://docs.maschina.dev"
            className="inline-flex items-center text-sm text-white/60 hover:text-white/90 transition-colors border border-white/10 hover:border-white/20 rounded-full px-5 py-2.5"
          >
            Read the docs
          </a>
        </div>
      </div>

      {/* Terminal preview */}
      <div className="border-t border-b border-white/5 px-28 py-16">
        <div
          ref={blockRef}
          onMouseDown={() => setBlockFocused(true)}
          className="w-full h-[670px] border border-white/5 overflow-hidden relative"
        >
          {/* Block header */}
          <div className="relative z-10 flex items-stretch bg-black/40 backdrop-blur-sm">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 text-sm transition-colors border-b-2 ${activeTab === tab ? "text-white bg-white/8 border-white" : "text-white/30 hover:text-white/60 hover:bg-white/4 border-transparent"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Terminal shape */}
          <div className="relative z-10 flex justify-center px-44 pt-10">
            <div className="w-full rounded-xl border border-white/10 bg-black/85 backdrop-blur-md overflow-hidden">
              {/* Window chrome */}
              <div className="relative flex items-center gap-2 px-4 py-3 border-b border-white/8" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <div className={`w-3 h-3 rounded-full transition-colors ${blockFocused ? "bg-[#FF5F56]" : "bg-white/15"}`} />
                <div className={`w-3 h-3 rounded-full transition-colors ${blockFocused ? "bg-[#FFBD2E]" : "bg-white/15"}`} />
                <div className={`w-3 h-3 rounded-full transition-colors ${blockFocused ? "bg-[#27C93F]" : "bg-white/15"}`} />
                <span className="absolute left-1/2 -translate-x-1/2 text-xs text-white/30">maschina — 133×35</span>
              </div>

              <TerminalBody tab={activeTab} />

              {/* Status bar */}
              <div className="flex justify-center py-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span className="text-xs text-white/20">hello@maschina.dev • enterprise • v0.1.0 (54ee6c7) • ↑↓ navigate • enter select • t theme • esc quit</span>
              </div>
            </div>
          </div>

          <div className="absolute inset-0">
            <Silk
              speed={2.9}
              scale={0.8}
              color="#c8cdd6"
              noiseIntensity={4.1}
              rotation={3.1}
            />
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="border-t border-white/5 border-b border-white/5">
        <div className="px-28 py-24">
          <ScrambleText text="HOW IT WORKS" className="text-xs text-white/30 tracking-widest uppercase mb-14 block" />
          <div className="grid grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Write your agent",
                body: "Define your agent in a config file. Pick a model — Claude, GPT, Llama, or your own. Set inputs, outputs, and runtime behavior.",
              },
              {
                step: "02",
                title: "Deploy to the network",
                body: "One command ships your agent to distributed nodes worldwide. No servers to provision, no infra to manage. It's just running.",
              },
              {
                step: "03",
                title: "Earn on every run",
                body: "Publish to the marketplace and collect 65% of every execution. Billing, routing, and settlement are handled automatically.",
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col gap-5">
                <span className="text-xs font-mono" style={{ color: "#F84242" }}>{item.step}</span>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why Maschina */}
      <div className="px-28 py-24">
        <ScrambleText text="THE NETWORK" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-4 gap-3">
          {[
            { prefix: "",  to: 40,   decimals: 0, suffix: "+",  label: "Countries",      body: "Nodes spanning every major region — your agents run close to your users." },
            { prefix: "",  to: 65,   decimals: 0, suffix: "%",  label: "Developer cut",  body: "You keep 65% of every run. The rest goes to nodes, validators, and treasury." },
            { prefix: "<", to: 50,   decimals: 0, suffix: "ms", label: "Median latency", body: "Jobs route to the nearest available node with the right model loaded." },
            { prefix: "",  to: 99.9, decimals: 1, suffix: "%",  label: "Network uptime", body: "Redundant execution paths mean no single node failure takes your agent down." },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-4" style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}>
              <div className="text-3xl font-bold text-white">
                <CountUp prefix={card.prefix} to={card.to} decimals={card.decimals} suffix={card.suffix} />
              </div>
              <div>
                <p className="text-sm font-medium text-white/70 mb-2">{card.label}</p>
                <p className="text-xs text-white/35 leading-relaxed">{card.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Built for */}
      <div className="border-t border-white/5">
        <div className="px-28 py-24 grid grid-cols-2 gap-24 items-center">
          <div>
            <ScrambleText text="BUILT FOR" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
            <h2 className="text-3xl font-bold text-white leading-snug mb-6">
              Everyone who builds with AI.<br />Everyone who has a machine.
            </h2>
            <p className="text-base text-white/40 leading-relaxed">
              Developers get a global execution layer for their agents. Node runners get paid to run them. The network belongs to both.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { title: "Developers",     body: "Deploy agents in minutes. Access every major model. Pay per run, not per seat." },
              { title: "Node runners", body: "Contribute your idle compute. Earn on every job routed your way. No staking required." },
              { title: "Teams",          body: "Share agents across your org. Role-based access, audit logs, and shared billing." },
              { title: "Enterprises",    body: "On-premise deployment, custom SLA, dedicated infrastructure, and volume pricing." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/[0.08] px-6 py-5" style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}>
                <p className="text-sm font-semibold text-white mb-1.5">{item.title}</p>
                <p className="text-xs text-white/40 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-white/5 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 80% at 50% 120%, rgba(248,66,66,0.09) 0%, transparent 70%)" }} />
        <div className="relative px-28 py-28 flex flex-col items-center text-center gap-8">
          <h2 className="text-5xl font-bold text-white leading-tight tracking-tight">
            The network is live.<br />Your agents should be too.
          </h2>
          <div className="flex items-center gap-4">
            <a href="/download" className="inline-flex items-center gap-2 bg-white text-black text-sm font-medium rounded-full px-6 py-3 hover:bg-white/90 transition-colors">
              <DownloadSimple size={16} weight="bold" />
              Download CLI
            </a>
            <a href="https://docs.maschina.dev" target="_blank" rel="noreferrer" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Read the docs
            </a>
          </div>
        </div>
      </div>

      <Footer />

    </main>
  );
}

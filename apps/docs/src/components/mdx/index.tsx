import { useState, useRef, useContext, createContext } from "react";
import React from "react";
import { Copy, Check } from "@phosphor-icons/react";

// ─── CodeGroupContext ──────────────────────────────────────────────────────────

const CodeGroupCtx = createContext(false);

// ─── CodeBlock ────────────────────────────────────────────────────────────────

export function CodeBlock({ style, className, ...p }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  const inGroup = useContext(CodeGroupCtx);

  const copy = () => {
    navigator.clipboard.writeText(ref.current?.innerText ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pre = (
    <pre
      ref={ref}
      {...p}
      style={style}
      className={`overflow-x-auto text-sm leading-6 p-5 ${className ?? ""}`}
    />
  );

  if (inGroup) return pre;

  return (
    <div className="relative group mb-6 rounded-xl overflow-hidden">
      {pre}
      <button
        onClick={copy}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-black/30 hover:bg-black/50 text-white/40 hover:text-white/80"
      >
        {copied ? <Check size={13} weight="bold" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

// ─── CodeGroup ────────────────────────────────────────────────────────────────

function findProp(node: React.ReactNode, key: string): string | undefined {
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as Record<string, unknown>;
  if (props[key]) return String(props[key]);
  for (const child of React.Children.toArray(props.children as React.ReactNode)) {
    const found = findProp(child, key);
    if (found) return found;
  }
  return undefined;
}

function findFigcaption(node: React.ReactNode): string | undefined {
  if (!React.isValidElement(node)) return undefined;
  const el = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (el.type === "figcaption") return String(el.props.children ?? "");
  for (const child of React.Children.toArray(el.props.children)) {
    const found = findFigcaption(child);
    if (found) return found;
  }
  return undefined;
}

const LANG_LABELS: Record<string, string> = {
  typescript: "TypeScript", ts: "TypeScript",
  javascript: "JavaScript", js: "JavaScript",
  python: "Python", py: "Python",
  rust: "Rust", rs: "Rust",
  bash: "bash", sh: "bash", shell: "bash",
  json: "JSON", yaml: "YAML", toml: "TOML",
  npm: "npm", pnpm: "pnpm", yarn: "yarn", bun: "bun", cargo: "cargo",
  go: "Go", java: "Java", swift: "Swift", kotlin: "Kotlin",
  css: "CSS", html: "HTML", sql: "SQL",
};

export function CodeGroup({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const blocks = React.Children.toArray(children).filter(Boolean);

  const getLabel = (block: React.ReactNode, i: number): string => {
    const caption = findFigcaption(block);
    if (caption) return caption;
    const lang = findProp(block, "data-language");
    if (lang) return LANG_LABELS[lang.toLowerCase()] ?? lang;
    return `Tab ${i + 1}`;
  };

  const labels = blocks.map(getLabel);

  return (
    <CodeGroupCtx.Provider value={true}>
      <div className="mb-8 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex relative" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {labels.map((label, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-4 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-px ${
                active === i
                  ? "text-white/80 border-[#F84242]"
                  : "text-white/30 border-transparent hover:text-white/55"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          {blocks.map((block, i) => (
            <div key={i} className={i === active ? "block" : "hidden"}>
              {block}
            </div>
          ))}
          <button
            onClick={() => {
              const el = document.querySelectorAll("[data-cg-active]")[0];
              navigator.clipboard.writeText(el?.textContent ?? "");
            }}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors"
          >
            <Copy size={13} />
          </button>
        </div>
      </div>
    </CodeGroupCtx.Provider>
  );
}

// ─── CardGroup ────────────────────────────────────────────────────────────────

export function CardGroup({ cols = 2, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div
      className="mb-8 gap-4"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {children}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  icon?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="border border-white/8 rounded-xl p-5 hover:border-white/15 transition-colors h-full bg-white/[0.01]">
      <p style={{ fontFamily: "Sohne, sans-serif" }} className="text-sm text-white mb-2">{title}</p>
      {children && <div className="text-xs text-white/45 leading-6">{children}</div>}
    </div>
  );
  if (href) return <a href={href} className="block no-underline">{inner}</a>;
  return inner;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function Stats({ data }: { data: Record<string, string> }) {
  return (
    <div className="mb-6 rounded-xl border border-white/6 overflow-hidden">
      {Object.entries(data).map(([key, value], i, arr) => (
        <div
          key={key}
          className={`flex items-baseline gap-6 px-5 py-3 ${i !== arr.length - 1 ? "border-b border-white/5" : ""} ${i % 2 === 0 ? "bg-white/[0.015]" : ""}`}
        >
          <span className="text-xs text-white/35 font-mono w-36 shrink-0">{key}</span>
          <span className="text-sm text-white/80 font-mono">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Diagram ──────────────────────────────────────────────────────────────────

interface DiagramNode { id: string; label: string; x: number; y: number; accent?: boolean }
interface DiagramEdge { from: string; to: string }

export function Diagram({ nodes, edges }: { nodes: DiagramNode[]; edges: DiagramEdge[] }) {
  const NW = 130; const NH = 36;
  const W = 800; const H = 340;
  const pos = Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

  return (
    <div className="mb-8 rounded-xl overflow-hidden p-4 bg-white/[0.03]" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: "SohneMono, monospace" }}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.2)" />
          </marker>
        </defs>
        {edges.map(({ from, to }, i) => {
          const s = pos[from]; const e = pos[to];
          if (!s || !e) return null;
          const sx = s.x + NW; const sy = s.y + NH / 2;
          const ex = e.x; const ey = e.y + NH / 2;
          const cx = (sx + ex) / 2;
          return <path key={i} d={`M ${sx} ${sy} C ${cx} ${sy}, ${cx} ${ey}, ${ex} ${ey}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" markerEnd="url(#arrow)" />;
        })}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <rect width={NW} height={NH} rx={6} fill={n.accent ? "rgba(248,66,66,0.08)" : "rgba(255,255,255,0.04)"} stroke={n.accent ? "rgba(248,66,66,0.25)" : "rgba(255,255,255,0.1)"} strokeWidth="1" />
            <text x={NW / 2} y={NH / 2 + 4} textAnchor="middle" fontSize="11" fill={n.accent ? "#F84242" : "rgba(255,255,255,0.65)"}>{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { MDXProvider } from "@mdx-js/react";
import { ScrollIndicator } from "../components/ScrollIndicator.js";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { MagnifyingGlass, ComputerTower, SunHorizon, MoonStars, Package } from "@phosphor-icons/react";
import { SiGithub, SiDiscord } from "@icons-pack/react-simple-icons";
import { Kbd, KbdGroup } from "@maschina/ui";
import { CodeBlock, CodeGroup, CardGroup, Card, Diagram, Stats } from "../components/mdx/index.js";
import { MermaidDiagram } from "../components/MermaidDiagram.js";
import { ScrambleText } from "../components/ScrambleText.js";

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode }).children);
  return "";
}

const components = {
  CodeBlock,
  CodeGroup,
  CardGroup,
  Card,
  Diagram,
  Stats,
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h1 style={{ fontFamily: "Sohne, sans-serif" }} className="text-3xl text-white mt-0 mb-6 tracking-tight" {...p} />,
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h2 style={{ fontFamily: "Sohne, sans-serif" }} className="text-xl text-white mt-10 mb-4 scroll-mt-32 tracking-tight" {...p} />,
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h3 style={{ fontFamily: "Sohne, sans-serif" }} className="text-base text-white/80 mt-8 mb-3 scroll-mt-32" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="text-white/60 leading-7 mb-4 text-sm" {...p} />,
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-[#F84242]/80 hover:text-[#F84242] underline-offset-2 underline transition-colors" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc pl-5 text-white/60 text-sm mb-4 space-y-1.5" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal pl-5 text-white/60 text-sm mb-4 space-y-1.5" {...p} />,
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-7" {...p} />,
  blockquote: (p: React.HTMLAttributes<HTMLQuoteElement>) => <blockquote className="border-l-2 border-white/15 pl-4 text-white/40 italic my-6 text-sm" {...p} />,
  hr: (p: React.HTMLAttributes<HTMLHRElement>) => <hr className="border-white/10 my-8" {...p} />,
  code: (p: React.HTMLAttributes<HTMLElement> & { "data-language"?: string }) => {
    if (p["data-language"] !== undefined) return <code {...p} />;
    return <code className="bg-white/8 text-white/80 px-1.5 py-0.5 rounded text-[0.82em] font-mono" {...p} />;
  },
  figure: ({ children }: React.HTMLAttributes<HTMLElement>) => <>{children}</>,
  pre: ({ style, className, children, ...p }: React.HTMLAttributes<HTMLPreElement> & { "data-language"?: string }) => {
    if (p["data-language"] === "mermaid") {
      return <MermaidDiagram code={extractText(children)} />;
    }
    return <CodeBlock style={style} className={className} {...p}>{children}</CodeBlock>;
  },
  table: (p: React.HTMLAttributes<HTMLTableElement>) => <div className="overflow-x-auto mb-6"><table className="w-full text-sm text-white/60 border-collapse" {...p} /></div>,
  th: (p: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className="text-left text-white/40 font-medium border-b border-white/10 py-2 pr-6 text-xs uppercase tracking-wide" {...p} />,
  td: (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className="border-b border-white/5 py-2 pr-6 align-top" {...p} />,
};

// ─── Theme toggle ─────────────────────────────────────────────────────────────

type Theme = "system" | "light" | "dark";

const themes: { value: Theme; icon: React.ElementType }[] = [
  { value: "light", icon: SunHorizon },
  { value: "dark", icon: MoonStars },
  { value: "system", icon: ComputerTower },
];

function ThemeToggle() {
  const [index, setIndex] = useState(0);
  const { icon: Icon } = themes[index];
  return (
    <button
      onClick={() => setIndex((i) => (i + 1) % themes.length)}
      className="inline-flex items-center justify-center border border-white/10 rounded-full p-1.5 text-white/50 hover:text-white/90 hover:border-white/20 transition-colors"
    >
      <Icon size={22} />
    </button>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const navGroups = [
  { group: "Overview", items: [
    { label: "Introduction", href: "/introduction" },
    { label: "Quickstart", href: "/quickstart" },
    { label: "Concepts", href: "/concepts" },
    { label: "Install", href: "/install" },
    { label: "Changelog", href: "/changelog" },
  ]},
  { group: "Guides", items: [
    { label: "First Agent", href: "/guides/first-agent" },
    { label: "CLI", href: "/guides/cli" },
    { label: "Models", href: "/guides/models" },
    { label: "Webhooks", href: "/guides/webhooks" },
    { label: "Realtime", href: "/guides/realtime" },
    { label: "Search", href: "/guides/search" },
    { label: "Troubleshooting", href: "/guides/troubleshooting" },
    { label: "FAQ", href: "/guides/faq" },
  ]},
  { group: "Platform", items: [
    { label: "Overview", href: "/platform/overview" },
    { label: "Network", href: "/platform/network" },
    { label: "Nodes", href: "/platform/nodes" },
    { label: "Marketplace", href: "/platform/marketplace" },
    { label: "Economics", href: "/platform/economics" },
    { label: "Roadmap", href: "/platform/roadmap" },
  ]},
  { group: "SDKs", items: [
    { label: "TypeScript", href: "/sdks/typescript" },
    { label: "Python", href: "/sdks/python" },
    { label: "Rust", href: "/sdks/rust" },
    { label: "REST", href: "/sdks/rest" },
  ]},
  { group: "API Reference", items: [
    { label: "Authentication", href: "/api-reference/authentication" },
    { label: "Agents", href: "/api-reference/agents" },
    { label: "Runs", href: "/api-reference/runs" },
    { label: "API Keys", href: "/api-reference/keys" },
    { label: "Webhooks", href: "/api-reference/webhooks" },
    { label: "Usage", href: "/api-reference/usage" },
    { label: "Realtime", href: "/api-reference/realtime" },
    { label: "Search", href: "/api-reference/search" },
    { label: "Compliance", href: "/api-reference/compliance" },
  ]},
  { group: "Self-Hosting", items: [
    { label: "Overview", href: "/self-hosting/overview" },
    { label: "Architecture", href: "/self-hosting/architecture" },
    { label: "Docker", href: "/self-hosting/docker" },
    { label: "Environment", href: "/self-hosting/environment" },
    { label: "Fly.io", href: "/self-hosting/fly" },
  ]},
];

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed top-[7rem] left-20 bottom-0 w-64 border-r border-white/5 overflow-y-auto px-4 pt-8 pb-6">
      {navGroups.map(({ group, items }) => (
        <div key={group} className="mb-8">
          <p style={{ fontFamily: "Sohne, sans-serif" }} className="text-[10px] uppercase tracking-widest text-white/25 font-medium mb-3 px-2">{group}</p>
          <ul className="space-y-1">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`block px-2 py-1.5 text-sm rounded-xl transition-colors ${
                      active
                        ? "bg-[#F84242]/10 text-[#F84242]"
                        : "text-white/45 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  for (const { group, items } of navGroups) {
    if (items.some((i) => i.href === pathname)) {
      return (
        <ScrambleText
          text={group.toUpperCase()}
          className="text-xs text-[#F84242]/70 tracking-widest uppercase mb-4 block"
        />
      );
    }
  }
  return null;
}

function TableOfContents({ pathname }: { pathname: string }) {
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const collect = () => {
      const els = Array.from(document.querySelectorAll("article h2, article h3"));
      setHeadings(els.map((el) => ({
        id: el.id,
        text: el.textContent ?? "",
        level: el.tagName === "H2" ? 2 : 3,
      })));
    };
    const t = setTimeout(collect, 80);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!headings.length) return;
    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-112px 0px -60% 0px", threshold: 0 }
    );
    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [headings]);

  if (!headings.length) return null;

  return (
    <aside className="fixed top-[7rem] right-20 bottom-0 w-56 overflow-y-auto pt-8 pb-6">
      <p style={{ fontFamily: "Sohne, sans-serif" }} className="text-[10px] uppercase tracking-widest text-white/25 font-medium mb-3 px-2">On this page</p>
      <ul className="space-y-1">
        {headings.map(({ id, text, level }) => {
          const active = activeId === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`block py-1.5 text-xs rounded transition-colors ${level === 3 ? "px-4" : "px-2"} ${
                  active ? "text-[#F84242]" : "text-white/40 hover:text-white/70"
                }`}
              >
                {text}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Root() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <RootLayout dark><TooltipProvider>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 w-full bg-black/60 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-28">
        <div className="flex items-center gap-2">
          <a href="/"><img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" /></a>
          <span className="text-[10px] text-[#F84242]/80 border border-[#F84242]/20 rounded-full px-1.5 py-0.5 leading-none">v0.1.0</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 w-[28rem]">
          <MagnifyingGlass size={17} className="text-white/60 shrink-0" />
          <input type="text" placeholder="Search..." className="bg-transparent text-sm text-white/60 placeholder:text-white/30 outline-none w-full" />
          <KbdGroup className="shrink-0 opacity-40">
            <Kbd className="text-base leading-none">⌘</Kbd>
            <Kbd className="text-xs">K</Kbd>
          </KbdGroup>
        </div>
        <div className="flex items-center gap-2">
          <a href="/packages" className="inline-flex items-center justify-center border border-white/10 rounded-full p-1.5 text-white/50 hover:text-white/90 hover:border-white/20 transition-colors">
            <Package size={22} />
          </a>
          <a href="https://github.com/maschina-labs" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center border border-white/10 rounded-full p-1.5 text-white/50 hover:text-white/90 hover:border-white/20 transition-colors">
            <SiGithub size={22} />
          </a>
          <a href="https://discord.gg/maschina" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center border border-white/10 rounded-full p-1.5 text-white/50 hover:text-white/90 hover:border-white/20 transition-colors">
            <SiDiscord size={22} />
          </a>
          <ThemeToggle />
        </div>
      </header>

      <nav className="fixed top-16 left-0 right-0 z-40 h-12 w-full bg-black/60 backdrop-blur-md border-b border-white/5 flex items-center px-28 gap-8">
        {["Overview","Install","Agents","Models","CLI","API","Plugins","Platforms","Reference","Help"].map((label) => (
          <a key={label} href="#" className="text-sm text-white/50 hover:text-white/90 transition-colors whitespace-nowrap">{label}</a>
        ))}
      </nav>

      <ScrollIndicator />
      <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, left: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />
      <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, right: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />

      <div className="pt-[7rem] flex">
        <Sidebar pathname={pathname} />
        <TableOfContents pathname={pathname} />

        <main className="ml-[21rem] flex-1 min-w-0 py-10">
          <div className="w-full max-w-2xl px-8" style={{ marginLeft: "max(2rem, calc(50vw - 42rem))" }}>
            <Breadcrumb pathname={pathname} />
            <MDXProvider components={components}>
              <article className="max-w-none">
                <Outlet />
              </article>
            </MDXProvider>
            <div style={{ height: "50vh" }} className="flex flex-col justify-end pb-10">
              <div className="border-t border-white/5 pt-8 flex flex-col items-center gap-3 text-center">
                <p className="text-xs text-white/25">
                  Powered by <span className="text-[#F84242]">Maschina</span>
                </p>
                <p className="text-xs text-white/25">
                  Licensed under{" "}
                  <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors">
                    Apache 2.0
                  </a>
                </p>
                <a href="https://github.com/maschina-labs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-white/25 hover:text-white/60 transition-colors">
                  <SiGithub size={13} className="shrink-0" />
                  <span>See something missing? Contribute to the docs on GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider></RootLayout>
  );
}

export const Route = createRootRoute({ component: Root });

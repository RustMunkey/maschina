import { useState, useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ComputerTower, SunHorizon, MoonStars } from "@phosphor-icons/react";
import { ScrollIndicator } from "../components/ScrollIndicator";
import { token, storeSession } from "../lib/api.js";

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

function Root() {
  const [signedIn, setSignedIn] = useState(false);
  const authUrl = import.meta.env.VITE_AUTH_URL ?? "http://localhost:5173";
  const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:5175";

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = "/favicon.svg";
    document.head.appendChild(link);

    // Read tokens from URL fragment after cross-origin auth redirect
    const hash = window.location.hash;
    if (hash.includes("_at=")) {
      const params = new URLSearchParams(hash.slice(1));
      const at = params.get("_at");
      const rt = params.get("_rt");
      if (at && rt) {
        storeSession({ accessToken: at, refreshToken: rt });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    setSignedIn(!!token.get());
  }, []);

  return (
    <RootLayout dark><TooltipProvider>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 w-full bg-black/60 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-28">
        <div className="flex items-center gap-2">
          <a href="/"><img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" /></a>
          <span className="text-[10px] text-[#F84242]/80 border border-[#F84242]/20 rounded-full px-1.5 py-0.5 leading-none">v0.1.0</span>
        </div>
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8">
          <a href="/network" className="text-sm text-white/60 hover:text-white/90 transition-colors">Network</a>
          <a href="/marketplace" className="text-sm text-white/60 hover:text-white/90 transition-colors">Marketplace</a>
          <a href="/developers" className="text-sm text-white/60 hover:text-white/90 transition-colors">Developers</a>
          <a href="/pricing" className="text-sm text-white/60 hover:text-white/90 transition-colors">Pricing</a>
          <a href="/about" className="text-sm text-white/60 hover:text-white/90 transition-colors">About</a>
        </nav>
        <div className="flex items-center gap-3">
          {signedIn
            ? <a href={appUrl} className="text-sm text-white/60 hover:text-white/90 transition-colors">Dashboard</a>
            : <a href={`${authUrl}/signin`} className="text-sm text-white/60 hover:text-white/90 transition-colors">Sign In</a>
          }
          <div className="flex items-center gap-2">
            <a href="/download" className="text-sm text-[#F84242]/80 hover:text-[#F84242] transition-colors border border-[#F84242]/20 hover:border-[#F84242]/40 rounded-full px-4 py-1.5">Download</a>
            <a href="https://github.com/maschina-labs" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center border border-white/10 rounded-full p-1.5 text-white/50 hover:text-white/90 hover:border-white/20 transition-colors">
              <SiGithub size={22} />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <ScrollIndicator />
      {/* Vertical margin dividers */}
      <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, left: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />
      <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, right: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />
      <Outlet />
    </TooltipProvider></RootLayout>
  );
}

export const Route = createRootRoute({ component: Root });

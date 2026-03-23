import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { useEffect } from "react";
import { ScrollIndicator } from "../components/ScrollIndicator.js";
import { Toaster } from "sonner";
import { NotFound } from "../components/NotFound.js";

function Root() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = "/favicon.svg";
    document.head.appendChild(link);
  }, []);

  return (
    <RootLayout dark><TooltipProvider>
      <div className="min-h-dvh bg-black">
        {/* Skip to main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[99999] focus:rounded-xl focus:border focus:border-white/20 focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, left: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />
        <div aria-hidden style={{ position: "fixed", top: 0, bottom: 0, right: "5rem", width: "1px", background: "rgba(255,255,255,0.08)", pointerEvents: "none", zIndex: 9999 }} />
        <ScrollIndicator />
        <Toaster
          position="top-center"
          offset={80}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex items-center justify-center gap-3 w-full rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md",
              error:   "bg-[#F84242]/[0.06] border-[#F84242]/25 text-[#F84242]/90",
              success: "bg-green-500/[0.06] border-green-500/25 text-green-400/90",
              warning: "bg-amber-500/[0.06] border-amber-500/25 text-amber-400/90",
              info:    "bg-white/[0.04] border-white/10 text-white/50",
              icon:    "shrink-0",
              description: "text-xs font-normal opacity-70 mt-0.5",
            },
          }}
        />
        <Outlet />
        <footer className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-black/60 backdrop-blur-md border-t border-white/10" />
      </div>
    </TooltipProvider></RootLayout>
  );
}

export const Route = createRootRoute({ component: Root, notFoundComponent: NotFound });

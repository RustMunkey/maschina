import { createFileRoute } from "@tanstack/react-router";
import { Noise } from "../components/Noise.js";

export const Route = createFileRoute("/401")({ component: UnauthorizedPage });

function UnauthorizedPage() {
  return (
    <div className="min-h-dvh bg-black flex flex-col">
      {/* Noise — clipped to content area */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "64px",
          bottom: "64px",
          left: "5rem",
          right: "5rem",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <Noise patternAlpha={12} />
      </div>

      {/* Radial glow */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 40% 40% at 50% 50%, rgba(248,66,66,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center justify-center px-28">
        <img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" />
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-16 text-center outline-none" style={{ position: "relative", zIndex: 2 }}>
        <div className="relative px-20 py-16 flex flex-col items-center">
          {/* Brackets */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
          </div>

          <p className="text-[120px] font-bold leading-none tracking-tighter text-[#F84242]/10 select-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>401</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white mt-2">Unauthorized.</h1>
          <p className="mt-2 text-sm text-white/30">You need to sign in to access this page.</p>
          <div className="flex items-center gap-3 mt-8">
            <button
              type="button"
              onClick={() => history.back()}
              aria-label="Go back"
              className="text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-6 py-2"
            >
              Go back
            </button>
            <a
              href="/signin"
              className="text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-6 py-2"
            >
              Sign In
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trio } from "ldrs/react";
import "ldrs/react/Trio.css";

function AnimatedX() {
  return (
    <>
      <style>{`
        @keyframes cb-draw-x-circle { to { stroke-dashoffset: 0; } }
        @keyframes cb-draw-x        { to { stroke-dashoffset: 0; } }
        @keyframes cb-pop-x {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .cb-x-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: cb-draw-x-circle 0.6s cubic-bezier(0.65,0,0.45,1) forwards; }
        .cb-x-line-1 { stroke-dasharray: 23;  stroke-dashoffset: 23;  animation: cb-draw-x 0.25s ease forwards 0.65s; }
        .cb-x-line-2 { stroke-dasharray: 23;  stroke-dashoffset: 23;  animation: cb-draw-x 0.25s ease forwards 0.85s; }
        .cb-x-wrap   { animation: cb-pop-x 0.3s ease forwards 1.05s; transform: scale(0.8); }
      `}</style>
      <div className="cb-x-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none">
          <circle className="cb-x-circle" cx="26" cy="26" r="25" fill="rgba(248,66,66,0.04)" stroke="rgba(248,66,66,0.25)" strokeWidth="1.5" />
          <path className="cb-x-line-1" d="M18 18L34 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
          <path className="cb-x-line-2" d="M34 18L18 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
}

function AnimatedCheck() {
  return (
    <>
      <style>{`
        @keyframes cb-draw-circle { to { stroke-dashoffset: 0; } }
        @keyframes cb-draw-check  { to { stroke-dashoffset: 0; } }
        @keyframes cb-pop {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .cb-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: cb-draw-circle 0.6s cubic-bezier(0.65,0,0.45,1) forwards; }
        .cb-check  { stroke-dasharray: 60;  stroke-dashoffset: 60;  animation: cb-draw-check 0.35s ease forwards 0.65s; }
        .cb-wrap   { animation: cb-pop 0.3s ease forwards 0.95s; transform: scale(0.8); }
      `}</style>
      <div className="cb-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none">
          <circle className="cb-circle" cx="26" cy="26" r="25" fill="rgba(248,66,66,0.04)" stroke="rgba(248,66,66,0.25)" strokeWidth="1.5" />
          <path className="cb-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
}

function Brackets() {
  return (
    <>
      <style>{`
        @keyframes cb-brackets-in {
          from { opacity: 0; transform: scale(1.08); }
          to   { opacity: 1; transform: scale(1); }
        }
        .cb-brackets { animation: cb-brackets-in 0.4s ease forwards; }
      `}</style>
      <div className="cb-brackets absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
      </div>
    </>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  solana: "Solana",
};

export const Route = createFileRoute("/callback")({
  validateSearch: (s: Record<string, unknown>) => ({
    code:      typeof s["code"]      === "string" ? s["code"]      : undefined,
    state:     typeof s["state"]     === "string" ? s["state"]     : undefined,
    provider:  typeof s["provider"]  === "string" ? s["provider"]  : undefined,
    return_to: typeof s["return_to"] === "string" ? s["return_to"] : undefined,
    error:     typeof s["error"]     === "string" ? s["error"]     : undefined,
    preview:   s["preview"] === "pending" || s["preview"] === "success" || s["preview"] === "error"
      ? (s["preview"] as "pending" | "success" | "error")
      : undefined,
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const { provider, return_to, error: oauthError, preview } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "success" | "error">(
    preview ?? (oauthError ? "error" : "pending")
  );

  const providerLabel = provider ? (PROVIDER_LABELS[provider.toLowerCase()] ?? provider) : "your account";

  useEffect(() => {
    if (preview || oauthError) return;

    // TODO: exchange code with backend — POST /auth/callback
    // Simulated for now
    const t = setTimeout(() => {
      setStatus("success");
      setTimeout(() => navigate({ to: (return_to as never) ?? "/signin" }), 2000);
    }, 2000);

    return () => clearTimeout(t);
  }, [oauthError, return_to, navigate]);

  const hasGlow = true;

  return (
    <div className="min-h-dvh bg-black flex flex-col overflow-hidden">
      {/* Radial glow */}
      {hasGlow && (
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 40% 40% at 50% 50%, rgba(248,66,66,0.07) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center justify-center px-28">
        <img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" />

        {status === "pending" && (
          <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
            <style>{`
              @keyframes cb-sweep {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .cb-sweep { animation: cb-sweep 1.6s ease-in-out infinite alternate; }
            `}</style>
            <div className="cb-sweep absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-[#F84242]/60 to-transparent" />
          </div>
        )}
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-16 text-center outline-none">

        <div className="relative px-20 py-16 flex flex-col items-center" aria-live="polite" aria-atomic="true">
          <Brackets />

          {status === "pending" && (
            <>
              <div className="mb-6" role="status" aria-label="Connecting to provider">
                <Trio size="40" speed="1.3" color="#F84242" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Connecting...</h1>
              <p className="mt-2 text-sm text-white/30">
                Signing you in with <span className="text-white/50">{providerLabel}</span>
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mb-6" aria-hidden><AnimatedCheck /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">You're in.</h1>
              <p className="mt-2 text-sm text-white/30">Redirecting you now...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mb-6" aria-hidden><AnimatedX /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Connection failed.</h1>
              <p className="mt-2 text-sm text-white/30">
                {oauthError === "access_denied"
                  ? "You denied access. No worries."
                  : "Something went wrong with the OAuth flow."}
              </p>
              <a
                href="/signin"
                className="mt-8 text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-6 py-2"
              >
                Sign In
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { api, token } from "../lib/api.js";
import { Trio } from "ldrs/react";
import "ldrs/react/Trio.css";

function AnimatedCheck() {
  return (
    <>
      <style>{`
        @keyframes dev-draw-circle { to { stroke-dashoffset: 0; } }
        @keyframes dev-draw-check  { to { stroke-dashoffset: 0; } }
        @keyframes dev-pop {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .dev-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: dev-draw-circle 0.6s cubic-bezier(0.65,0,0.45,1) forwards; }
        .dev-check  { stroke-dasharray: 60;  stroke-dashoffset: 60;  animation: dev-draw-check 0.35s ease forwards 0.65s; }
        .dev-wrap   { animation: dev-pop 0.3s ease forwards 0.95s; transform: scale(0.8); }
      `}</style>
      <div className="dev-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none">
          <circle className="dev-circle" cx="26" cy="26" r="25" fill="rgba(248,66,66,0.04)" stroke="rgba(248,66,66,0.25)" strokeWidth="1.5" />
          <path className="dev-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
}

function AnimatedX() {
  return (
    <>
      <style>{`
        @keyframes dev-draw-x-circle { to { stroke-dashoffset: 0; } }
        @keyframes dev-draw-x        { to { stroke-dashoffset: 0; } }
        @keyframes dev-pop-x {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .dev-x-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: dev-draw-x-circle 0.6s cubic-bezier(0.65,0,0.45,1) forwards; }
        .dev-x-line-1 { stroke-dasharray: 23;  stroke-dashoffset: 23;  animation: dev-draw-x 0.25s ease forwards 0.65s; }
        .dev-x-line-2 { stroke-dasharray: 23;  stroke-dashoffset: 23;  animation: dev-draw-x 0.25s ease forwards 0.85s; }
        .dev-x-wrap   { animation: dev-pop-x 0.3s ease forwards 1.05s; transform: scale(0.8); }
      `}</style>
      <div className="dev-x-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none">
          <circle className="dev-x-circle" cx="26" cy="26" r="25" fill="rgba(248,66,66,0.04)" stroke="rgba(248,66,66,0.25)" strokeWidth="1.5" />
          <path className="dev-x-line-1" d="M18 18L34 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
          <path className="dev-x-line-2" d="M34 18L18 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
}

export const Route = createFileRoute("/device")({
  validateSearch: (s: Record<string, unknown>) => ({
    user_code: typeof s["user_code"] === "string" ? s["user_code"] : undefined,
    preview: s["preview"] === "entry" || s["preview"] === "confirming" || s["preview"] === "success" || s["preview"] === "error"
      ? (s["preview"] as "entry" | "confirming" | "success" | "error")
      : undefined,
  }),
  component: DevicePage,
});

function formatCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length > 4) return clean.slice(0, 4) + "-" + clean.slice(4, 8);
  return clean;
}

function DevicePage() {
  const { user_code, preview } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"entry" | "confirming" | "success" | "error">(preview ?? "entry");
  const [code, setCode] = useState(user_code ? formatCode(user_code) : "");
  const [error, setError] = useState<string | null>(null);

  // Guard: device confirm requires auth — redirect to signin if not logged in
  useEffect(() => {
    if (preview) return; // skip guard in preview mode
    if (!token.get()) {
      const returnTo = `/device${user_code ? `?user_code=${encodeURIComponent(user_code)}` : ""}`;
      navigate({ to: "/signin", search: { return_to: returnTo } });
    }
  }, []);

  const canSubmit = code.replace("-", "").length === 8 && status === "entry";

  async function handleAuthorize() {
    if (!canSubmit) return;
    setStatus("confirming");
    try {
      await api.post("/auth/device/confirm", { userCode: code });
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed.");
      setStatus("error");
    }
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const clean = raw.replace(/-/g, "");
    if (clean.length <= 8) setCode(formatCode(clean));
  }

  return (
    <div className="min-h-dvh bg-black flex flex-col overflow-hidden">
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
        {status === "confirming" && (
          <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
            <style>{`
              @keyframes dev-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
              .dev-sweep { animation: dev-sweep 1.6s ease-in-out infinite alternate; }
            `}</style>
            <div className="dev-sweep absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-[#F84242]/60 to-transparent" />
          </div>
        )}
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-16 text-center outline-none" aria-live="polite" aria-atomic="true">

        {/* Entry state */}
        {status === "entry" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Authorize device.</h1>
            <p className="mt-2 mb-10 text-sm text-white/30">
              Enter the code shown in your terminal.
            </p>
            <div className="relative px-16 py-12 flex flex-col items-center gap-6 w-full max-w-sm">
              {/* Brackets */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
              </div>
              <label htmlFor="device-code" className="sr-only">Device authorization code</label>
              <input
                id="device-code"
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder="XXXX-XXXX"
                maxLength={9}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                aria-label="Device authorization code"
                className="w-full text-center text-2xl font-bold tracking-[0.3em] bg-[#F84242]/[0.04] border border-[#F84242]/20 rounded-2xl px-5 py-4 text-[#F84242] placeholder:text-[#F84242]/20 outline-none focus:border-[#F84242]/50 transition-colors uppercase"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              />
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-white text-black text-sm font-semibold py-3 transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/90"
              >
                Authorize
              </button>
            </div>
            <p className="mt-6 text-xs text-white/20 text-center max-w-xs">
              Only authorize devices you control. This grants full CLI access to your account.
            </p>
          </>
        )}

        {/* Confirming state */}
        {status === "confirming" && (
          <div className="relative px-20 py-16 flex flex-col items-center">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
            </div>
            <div className="mb-6" role="status" aria-label="Authorizing device"><Trio size="40" speed="1.3" color="#F84242" /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Authorizing...</h1>
            <p className="mt-2 text-sm text-white/30">Confirming your device.</p>
          </div>
        )}

        {/* Success state */}
        {status === "success" && (
          <div className="relative px-20 py-16 flex flex-col items-center">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
            </div>
            <div className="mb-6" aria-hidden><AnimatedCheck /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Device authorized.</h1>
            <p className="mt-2 text-sm text-white/30">You can close this tab and return to your terminal.</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <>
            <div className="relative px-20 py-16 flex flex-col items-center">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
              </div>
              <div className="mb-6" aria-hidden><AnimatedX /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Authorization failed.</h1>
              <p className="mt-2 text-sm text-white/30">{error ?? "Something went wrong. Try again."}</p>
              <button
                type="button"
                onClick={() => { setStatus("entry"); setError(null); }}
                className="mt-8 text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-6 py-2"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Trio } from "ldrs/react";
import "ldrs/react/Trio.css";

function AnimatedCheck() {
  return (
    <>
      <style>{`
        @keyframes draw-circle {
          to { stroke-dashoffset: 0; }
        }
        @keyframes draw-check {
          to { stroke-dashoffset: 0; }
        }
        @keyframes pop {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .anim-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: draw-circle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .anim-check {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: draw-check 0.35s ease forwards 0.65s;
        }
        .anim-wrap {
          animation: pop 0.3s ease forwards 0.95s;
          transform: scale(0.8);
        }
      `}</style>
      <div className="anim-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle
            className="anim-circle"
            cx="26" cy="26" r="25"
            fill="rgba(248,66,66,0.04)"
            stroke="rgba(248,66,66,0.25)"
            strokeWidth="1.5"
          />
          <path
            className="anim-check"
            d="M14.1 27.2l7.1 7.2 16.7-16.8"
            stroke="#F84242"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
}

function AnimatedX() {
  return (
    <>
      <style>{`
        @keyframes draw-x-circle {
          to { stroke-dashoffset: 0; }
        }
        @keyframes draw-x {
          to { stroke-dashoffset: 0; }
        }
        @keyframes pop-x {
          0%   { transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .anim-x-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: draw-x-circle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .anim-x-line-1 {
          stroke-dasharray: 23;
          stroke-dashoffset: 23;
          animation: draw-x 0.25s ease forwards 0.65s;
        }
        .anim-x-line-2 {
          stroke-dasharray: 23;
          stroke-dashoffset: 23;
          animation: draw-x 0.25s ease forwards 0.85s;
        }
        .anim-x-wrap {
          animation: pop-x 0.3s ease forwards 1.05s;
          transform: scale(0.8);
        }
      `}</style>
      <div className="anim-x-wrap">
        <svg width="96" height="96" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle
            className="anim-x-circle"
            cx="26" cy="26" r="25"
            fill="rgba(248,66,66,0.04)"
            stroke="rgba(248,66,66,0.25)"
            strokeWidth="1.5"
          />
          <path className="anim-x-line-1" d="M18 18L34 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
          <path className="anim-x-line-2" d="M34 18L18 34" stroke="#F84242" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
}

function Brackets() {
  return (
    <>
      <style>{`
        @keyframes brackets-in {
          from { opacity: 0; transform: scale(1.08); }
          to   { opacity: 1; transform: scale(1); }
        }
        .brackets-wrap {
          animation: brackets-in 0.4s ease forwards;
        }
      `}</style>
      <div className="brackets-wrap absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
      </div>
    </>
  );
}

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s["token"] === "string" ? s["token"] : "",
    return_to: typeof s["return_to"] === "string" ? s["return_to"] : undefined,
    email: typeof s["email"] === "string" ? s["email"] : undefined,
    preview: s["preview"] === "pending" || s["preview"] === "success" || s["preview"] === "error"
      ? (s["preview"] as "pending" | "success" | "error")
      : undefined,
    demo: s["demo"] === "true" || s["demo"] === "1",
  }),
  component: VerifyPage,
});

type ErrorType = "expired" | "used" | "invalid";

function VerifyPage() {
  const { token: verifyToken, return_to, email, preview, demo } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "success" | "error">(preview ?? "pending");
  const [errorType, setErrorType] = useState<ErrorType>("invalid");

  useEffect(() => {
    if (preview) return;
    if (demo) {
      const t = setTimeout(() => setStatus("success"), 2000);
      return () => clearTimeout(t);
    }
    api
      .post("/auth/verify", { token: verifyToken })
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate({ to: (return_to as never) ?? "/signin" }), 2000);
      })
      .catch((err) => {
        const msg: string = err instanceof Error ? err.message : "";
        if (msg.includes("expired")) setErrorType("expired");
        else if (msg.includes("used") || msg.includes("already")) setErrorType("used");
        else setErrorType("invalid");
        setStatus("error");
      });
  }, [verifyToken, return_to, navigate, preview]);

  const hasGlow = true;

  const errorMessages: Record<ErrorType, { title: string; body: string }> = {
    expired: { title: "Link expired.", body: "This link has expired. Request a new one below." },
    used:    { title: "Already used.", body: "This link has already been used. Sign in below." },
    invalid: { title: "Invalid link.", body: "This link is invalid or malformed." },
  };

  return (
    <div className="min-h-dvh bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center justify-center px-28">
        <img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" />

        {status === "pending" && (
          <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
            <style>{`
              @keyframes sweep {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .progress-sweep {
                animation: sweep 1.6s ease-in-out infinite alternate;
              }
            `}</style>
            <div className="progress-sweep absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-[#F84242]/60 to-transparent" />
          </div>
        )}
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-16 text-center outline-none">
        {hasGlow && (
          <div
            aria-hidden
            className="fixed inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 40% 40% at 50% 50%, rgba(248,66,66,0.07) 0%, transparent 70%)",
            }}
          />
        )}

        <div className="relative px-20 py-16 flex flex-col items-center" aria-live="polite" aria-atomic="true">
          <Brackets />

          {status === "pending" && (
            <>
              <div className="mb-6" role="status" aria-label="Verifying link">
                <Trio size="40" speed="1.3" color="#F84242" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Verifying your link</h1>
              {email
                ? <p className="mt-2 text-sm text-white/30">Signing you in as <span className="text-white/50">{email}</span></p>
                : <p className="mt-2 text-sm text-white/30">Just a moment...</p>
              }
            </>
          )}

          {status === "success" && (
            <>
              <div className="mb-6" aria-hidden><AnimatedCheck /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">You're in.</h1>
              {email
                ? <p className="mt-2 text-sm text-white/30">Signed in as <span className="text-white/50">{email}</span></p>
                : <p className="mt-2 text-sm text-white/30">Redirecting you now...</p>
              }
            </>
          )}

          {status === "error" && (
            <>
              <div className="mb-6" aria-hidden><AnimatedX /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">{errorMessages[errorType].title}</h1>
              <p className="mt-2 text-sm text-white/30">{errorMessages[errorType].body}</p>
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

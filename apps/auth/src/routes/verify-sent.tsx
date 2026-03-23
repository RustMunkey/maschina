import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, storeSession } from "../lib/api.js";
import { toast } from "sonner";

function Brackets() {
  return (
    <>
      <style>{`
        @keyframes brackets-in {
          from { opacity: 0; transform: scale(1.08); }
          to   { opacity: 1; transform: scale(1); }
        }
        .brackets-wrap { animation: brackets-in 0.4s ease forwards; }
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

export const Route = createFileRoute("/verify-sent")({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s["email"] === "string" ? s["email"] : "",
    return_to: typeof s["return_to"] === "string" ? s["return_to"] : undefined,
  }),
  component: VerifySentPage,
});

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

function VerifySentPage() {
  const { email, return_to } = Route.useSearch();
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleChange(i: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
    if (next.every((d) => d !== "")) submitCode(next.join(""));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill("");
    pasted.split("").forEach((c, i) => { next[i] = c; });
    setDigits(next);
    inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    if (pasted.length === CODE_LENGTH) submitCode(pasted);
  }

  async function submitCode(code: string) {
    setLoading(true);
    try {
      const result = await api.post<{
        accessToken: string;
        refreshToken: string;
        sessionId: string;
        user: { id: string; email: string; isNew: boolean };
      }>("/auth/verify-otp", { email, code });
      storeSession(result);
      toast.success(result.user.isNew ? "Account created." : "Signed in.");
      const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:5175";
      const base = return_to && (return_to.startsWith("/") || return_to.startsWith("http"))
        ? return_to
        : appUrl;
      const isCrossOrigin = base.startsWith("http") && !base.startsWith(window.location.origin);
      const dest = isCrossOrigin
        ? `${base}#_at=${encodeURIComponent(result.accessToken)}&_rt=${encodeURIComponent(result.refreshToken)}`
        : base;
      window.location.href = dest;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code. Try again.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    try {
      await api.post("/auth/magic-link", { email, return_to });
      setCooldown(RESEND_COOLDOWN);
      toast.success("Code resent. Check your email.");
    } catch {
      toast.error("Failed to resend. Try again.");
    }
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
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-16 text-center outline-none">
        <div className="relative px-20 py-16 flex flex-col items-center">
          <Brackets />

          <h1 className="text-2xl font-semibold tracking-tight text-white">Check your email.</h1>
          <p className="mt-2 text-sm text-white/30">
            We sent a 6-digit code to{" "}
            {email
              ? <span className="text-white/50">{email}</span>
              : "your email"
            }.
          </p>

          {/* OTP inputs */}
          <div role="group" aria-label="One-time code" className="flex gap-2 mt-10">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={loading}
                className="w-11 h-14 text-center text-xl font-semibold text-[#F84242] bg-[#F84242]/[0.04] border border-[#F84242]/20 rounded-xl outline-none focus:border-[#F84242]/50 transition-colors disabled:opacity-40"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Resend */}
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            aria-label={cooldown > 0 ? `Resend code available in ${cooldown} seconds` : "Resend code"}
            className="mt-6 text-sm text-[#F84242]/50 hover:text-[#F84242]/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </main>
    </div>
  );
}

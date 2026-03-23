import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { toast } from "sonner";
import { SiGoogle, SiGithub, SiSolana } from "@icons-pack/react-simple-icons";
import { SessionExpiredModal } from "../components/SessionExpiredModal.js";

export const Route = createFileRoute("/signin")({
  validateSearch: (s: Record<string, unknown>) => ({
    return_to: typeof s["return_to"] === "string" ? s["return_to"] : undefined,
    offline: s["offline"] === "true" || s["offline"] === true || undefined,
    connected: s["connected"] === "true" || s["connected"] === true || undefined,
    session_expired: s["session_expired"] === "true" || s["session_expired"] === true || undefined,
  }),
  component: SignInPage,
});

function SignInPage() {
const { return_to, offline: previewOffline, connected: previewConnected, session_expired } = Route.useSearch();
  const navigate = useNavigate();


  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOffline, setShowOffline] = useState(previewOffline);
  const [showConnected, setShowConnected] = useState(previewConnected);

  useEffect(() => {
    if (!showConnected) return;
    const t = setTimeout(() => setShowConnected(false), 3000);
    return () => clearTimeout(t);
  }, [showConnected]);

  function validateEmail(value: string): string | null {
    if (!value.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid email address.";
    return null;
  }

  const canSubmit = !emailError && email.trim() !== "" && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setLoading(true);
    try {
      await api.post("/auth/magic-link", { email, return_to });
      await navigate({ to: "/verify-sent", search: { email, return_to } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-black flex flex-col">
      <SessionExpiredModal open={!!session_expired} returnTo="/signin" />

      {/* Offline banner — above header */}
      {showOffline && (
        <div role="status" aria-live="polite" className="fixed top-0 left-0 right-0 z-[10001] flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/[0.08] backdrop-blur-md">
          <div aria-hidden className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
          <p className="text-xs text-amber-400/70">No internet connection. Check your network and try again.</p>
          <button
            type="button"
            onClick={() => setShowOffline(false)}
            aria-label="Dismiss offline notification"
            className="absolute right-4 text-amber-400/30 hover:text-amber-400/70 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Connected banner — above header, auto-dismisses */}
      {showConnected && (
        <div role="status" aria-live="polite" className="fixed top-0 left-0 right-0 z-[10001] flex items-center justify-center gap-2 px-4 py-2 bg-green-500/[0.08] backdrop-blur-md">
          <div aria-hidden className="w-1.5 h-1.5 rounded-full bg-green-400/60 shrink-0" />
          <p className="text-xs text-green-400/70">Back online.</p>
          <button
            type="button"
            onClick={() => setShowConnected(false)}
            aria-label="Dismiss connected notification"
            className="absolute right-4 text-green-400/30 hover:text-green-400/70 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <header className="fixed left-0 right-0 z-50 h-16 bg-black/60 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-28" style={{ top: showOffline || showConnected ? "33px" : "0px" }}>
        <button
          type="button"
          onClick={() => history.back()}
          aria-label="Go back"
          className="text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-4 py-1.5"
        >
          Back
        </button>
        <img src="/logos/logo.svg" alt="Maschina" className="absolute left-1/2 -translate-x-1/2 h-7 w-auto" />
        <a
          href="/register"
          className="text-sm border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all rounded-full px-4 py-1.5"
        >
          Sign Up
        </a>
      </header>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col items-center justify-center pt-16 pb-10 outline-none">
        <h1 className="text-2xl font-semibold tracking-tight text-white px-5">Welcome back.</h1>
        <p className="mt-2 mb-10 text-sm text-white/30 px-5">
          Don't have an account?{" "}
          <a href="/register" className="text-white/70 font-semibold hover:text-white transition-colors">Sign Up</a>
        </p>

        {/* Bracketed form area */}
        <div className="relative w-full max-w-sm px-8 py-8 flex flex-col">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
          </div>

          {/* OAuth bento */}
          <div className="flex flex-col gap-2">
            <button type="button" className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all px-5 py-3">
              <SiGoogle size={16} aria-hidden />
              <span className="text-sm font-medium">Continue with Google</span>
            </button>
            <div className="flex gap-2">
              <button type="button" className="flex-1 flex items-center justify-center gap-3 rounded-2xl border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all px-5 py-3">
                <SiGithub size={16} aria-hidden />
                <span className="text-sm font-medium">GitHub</span>
              </button>
              <button type="button" className="flex-1 flex items-center justify-center gap-3 rounded-2xl border border-[#F84242]/20 bg-[#F84242]/[0.04] hover:bg-[#F84242]/[0.08] hover:border-[#F84242]/40 text-[#F84242]/70 hover:text-[#F84242] transition-all px-5 py-3">
                <SiSolana size={16} aria-hidden />
                <span className="text-sm font-medium">Solana</span>
              </button>
            </div>
          </div>

          {/* Divider — full viewport width */}
          <div className="flex items-center gap-3 mt-4 ml-[calc(-50vw+50%)] w-screen">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/20">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email */}
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="signin-email" className="sr-only">Email address</label>
              <input
                id="signin-email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                onBlur={() => setEmailError(validateEmail(email))}
                aria-invalid={emailError ? "true" : undefined}
                aria-describedby={emailError ? "signin-email-error" : undefined}
                className={`w-full bg-white/[0.03] border rounded-2xl px-5 py-3 text-sm text-white/70 placeholder:text-white/20 outline-none transition-colors ${emailError ? "border-[#F84242]/50 focus:border-[#F84242]/70" : "border-white/[0.08] focus:border-white/20"}`}
              />
              {emailError && <p id="signin-email-error" role="alert" className="text-xs text-[#F84242]/70 px-1">{emailError}</p>}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading}
              className="w-full rounded-2xl bg-white text-black text-sm font-semibold py-3 transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/90"
            >
              {loading ? "Sending link..." : "Continue with email"}
            </button>
          </form>

          <p className="mt-6 text-xs text-white/20 text-center">
            By continuing, you agree to our{" "}
            <a href="https://maschina.dev/terms" target="_blank" rel="noreferrer" className="underline hover:text-white/40 transition-colors">Terms of Service</a>
            {" "}and{" "}
            <a href="https://maschina.dev/privacy" target="_blank" rel="noreferrer" className="underline hover:text-white/40 transition-colors">Privacy Policy</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Noise } from "./Noise.js";

interface Props {
  open: boolean;
  returnTo?: string;
}

export function SessionExpiredModal({ open, returnTo }: Props) {
  const signInRef = useRef<HTMLAnchorElement>(null);

  // Focus the Sign In link when modal opens; trap focus within modal
  useEffect(() => {
    if (!open) return;
    signInRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") {
        e.preventDefault();
        signInRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  const signInUrl = returnTo
    ? `/signin?return_to=${encodeURIComponent(returnTo)}`
    : "/signin";

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm">
        <Noise patternAlpha={18} />
      </div>

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="fixed inset-0 z-[10000] flex items-center justify-center"
      >
        <div className="relative px-20 py-16 flex flex-col items-center text-center">
          {/* Brackets */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
          </div>

          <h2 id="session-expired-title" className="text-2xl font-semibold tracking-tight text-white">Session expired.</h2>
          <p className="mt-2 text-sm text-white/30 max-w-xs">
            You've been signed out. Sign in again to continue where you left off.
          </p>
          <a
            ref={signInRef}
            href={signInUrl}
            className="mt-8 w-full rounded-2xl bg-white text-black text-sm font-semibold py-3 text-center transition-colors hover:bg-white/90"
          >
            Sign In
          </a>
        </div>
      </div>
    </>
  );
}

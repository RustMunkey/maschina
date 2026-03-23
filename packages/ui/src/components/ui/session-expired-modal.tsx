import { Dialog as DialogPrimitive } from "radix-ui";

interface SessionExpiredModalProps {
  open: boolean;
  authUrl?: string;
  returnTo?: string;
}

export function SessionExpiredModal({
  open,
  authUrl = "https://auth.maschina.dev",
  returnTo,
}: SessionExpiredModalProps) {
  const signInUrl = returnTo
    ? `${authUrl}/signin?return_to=${encodeURIComponent(returnTo)}`
    : `${authUrl}/signin`;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm" />

        {/* Modal */}
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[10000] -translate-x-1/2 -translate-y-1/2 focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative px-20 py-16 flex flex-col items-center text-center">
            {/* Brackets */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#F84242]/20" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#F84242]/20" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#F84242]/20" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#F84242]/20" />
            </div>

            <div className="mb-1 w-2 h-2 rounded-full bg-[#F84242]/40" />
            <h2 className="text-2xl font-semibold tracking-tight text-white mt-4">
              Session expired.
            </h2>
            <p className="mt-2 text-sm text-white/30 max-w-xs">
              You've been signed out. Sign in again to continue where you left off.
            </p>

            <a
              href={signInUrl}
              className="mt-8 w-full rounded-2xl bg-white text-black text-sm font-semibold py-3 text-center transition-colors hover:bg-white/90"
            >
              Sign In
            </a>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

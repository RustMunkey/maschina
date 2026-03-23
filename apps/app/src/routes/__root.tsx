import { useEffect } from "react";
import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { token, storeSession } from "../lib/api.js";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
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

    const publicPaths = ["/login"];
    if (!token.get() && !publicPaths.includes(location.pathname)) {
      throw redirect({ to: "/login" });
    }
  },
  component: function AppRoot() {
    const authUrl = import.meta.env.VITE_AUTH_URL ?? "http://localhost:5173";

    useEffect(() => {
      function onSessionExpired() {
        window.location.href = `${authUrl}/signin?session_expired=true`;
      }
      window.addEventListener("maschina:session-expired", onSessionExpired);
      return () => window.removeEventListener("maschina:session-expired", onSessionExpired);
    }, []);

    return (
      <RootLayout>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </RootLayout>
    );
  },
});

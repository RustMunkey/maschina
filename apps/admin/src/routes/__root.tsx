import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { token } from "../lib/api.js";

export const Route = createRootRoute({
  beforeLoad: () => {
    // Admin requires a valid session; plan-tier gate enforced by the API
    if (!token.get()) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <RootLayout><TooltipProvider>
      <Outlet />
    </TooltipProvider></RootLayout>
  ),
});

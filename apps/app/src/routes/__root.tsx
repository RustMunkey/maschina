import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";
import { token } from "../lib/api.js";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const publicPaths = ["/login"];
    if (!token.get() && !publicPaths.includes(location.pathname)) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <RootLayout>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </RootLayout>
  ),
});

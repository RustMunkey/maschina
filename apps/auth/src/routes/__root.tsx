import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout, TooltipProvider } from "@maschina/ui";

export const Route = createRootRoute({
  component: () => (
    <RootLayout><TooltipProvider>
      <Outlet />
    </TooltipProvider></RootLayout>
  ),
});

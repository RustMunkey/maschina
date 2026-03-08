import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: ConsolLoginPage,
});

function ConsolLoginPage() {
  const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? "http://localhost:5175";
  window.location.href = `${AUTH_URL}/login?return_to=${encodeURIComponent(window.location.origin)}`;
  return null;
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const authUrl = import.meta.env.VITE_AUTH_URL ?? "http://localhost:5173";
  window.location.href = `${authUrl}/signin?return_to=${encodeURIComponent(window.location.origin)}`;
  return null;
}

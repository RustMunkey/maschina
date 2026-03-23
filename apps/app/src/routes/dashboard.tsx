import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, clearSession } from "../lib/api.js";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

async function signOut() {
  try { await api.post("/auth/logout"); } catch {}
  clearSession();
  window.location.href = import.meta.env.VITE_WEB_URL ?? "http://localhost:5174";
}

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ data: { id: string; email: string; role: string; plan: string } }>("/auth/me"),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div style={{ padding: 32, fontFamily: "monospace" }}>
      <h1>Dashboard</h1>

      {data && (
        <p>Signed in as {data.data.email} · Plan: {data.data.plan} · Role: {data.data.role}</p>
      )}

      <button onClick={signOut} style={{ marginTop: 16 }}>
        Sign out
      </button>

      {/* TODO: Onboarding — show on first sign-up (isNew from /auth/verify-otp) */}
      <div style={{ marginTop: 32, opacity: 0.4 }}>
        <p>[TODO] Onboarding — first-time user welcome flow</p>
      </div>

      {/* TODO: OAuth — Google, GitHub, Solana (no backend yet) */}
      <div style={{ marginTop: 16, opacity: 0.4 }}>
        <p>[TODO] OAuth — connect Google / GitHub / Solana wallet</p>
      </div>

      {/* TODO: Password — backend endpoints already exist */}
      <div style={{ marginTop: 16, opacity: 0.4 }}>
        <p>[TODO] Password — forgot/reset (POST /auth/forgot-password, POST /auth/reset-password)</p>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, token } from "../lib/api.js";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    return_to: typeof s["return_to"] === "string" ? s["return_to"] : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { return_to } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ data: { token: string } }>("/auth/login", { email, password });
      token.set(res.data.token);
      window.location.href = return_to ?? "http://localhost:5173";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Sign in to Maschina</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <a href="/register">Create account</a>
      <a href="/forgot-password">Forgot password?</a>
    </div>
  );
}

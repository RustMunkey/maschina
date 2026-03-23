import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s["token"] === "string" ? s["token"] : "",
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token: resetToken } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/auth/reset-password", { token: resetToken, password });
      await navigate({ to: "/signin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  return null;
}

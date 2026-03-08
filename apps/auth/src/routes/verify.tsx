import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s["token"] === "string" ? s["token"] : "",
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token: verifyToken } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");

  useEffect(() => {
    api
      .post("/auth/verify", { token: verifyToken })
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate({ to: "/login" }), 2000);
      })
      .catch(() => setStatus("error"));
  }, [verifyToken, navigate]);

  if (status === "pending") return <div>Verifying your email...</div>;
  if (status === "success") return <div>Email verified. Redirecting to login...</div>;
  return <div>Verification failed. The link may have expired.</div>;
}

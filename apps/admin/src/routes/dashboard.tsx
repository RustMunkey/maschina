import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => api.get<{ data: { plan: string } }>("/auth/me"),
  });

  return (
    <div>
      <h1>Admin</h1>
      <p>Plan: {data?.data.plan}</p>
      <nav>
        <a href="/users">Users</a>
        <a href="/billing">Billing</a>
        <a href="/flags">Feature Flags</a>
        <a href="/agents">Agents</a>
      </nav>
    </div>
  );
}

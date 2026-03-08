import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ data: { id: string; email: string; plan: string } }>("/auth/me"),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      {data && (
        <p>
          Signed in as {data.data.email} · Plan: {data.data.plan}
        </p>
      )}
    </div>
  );
}

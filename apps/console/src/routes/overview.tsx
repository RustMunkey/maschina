import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ status: string }>("/health"),
  });

  return (
    <div>
      <h1>Maschina Console</h1>
      <p>API: {data?.status ?? "checking..."}</p>
      <nav>
        <a href="/agents">Agents</a>
        <a href="/users">Users</a>
        <a href="/usage">Usage</a>
      </nav>
    </div>
  );
}

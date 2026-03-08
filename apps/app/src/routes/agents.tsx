import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<{ data: unknown[] }>("/agents"),
  });

  if (isLoading) return <div>Loading agents...</div>;

  return (
    <div>
      <h1>Agents</h1>
      <p>{data?.data.length ?? 0} agents</p>
    </div>
  );
}

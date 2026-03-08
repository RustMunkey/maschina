import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/usage")({
  component: UsagePage,
});

function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.get<{ data: unknown }>("/usage/summary"),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Usage</h1>
      <pre>{JSON.stringify(data?.data, null, 2)}</pre>
    </div>
  );
}

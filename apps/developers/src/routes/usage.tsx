import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/usage")({
  component: DevUsagePage,
});

function DevUsagePage() {
  const { data } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.get<{ data: unknown }>("/usage/summary"),
  });

  return (
    <div>
      <h1>Usage</h1>
      <pre>{JSON.stringify(data?.data, null, 2)}</pre>
    </div>
  );
}

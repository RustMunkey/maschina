import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<{ data: unknown }>("/billing/plan"),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Billing</h1>
      <pre>{JSON.stringify(data?.data, null, 2)}</pre>
    </div>
  );
}

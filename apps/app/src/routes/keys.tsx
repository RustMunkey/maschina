import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/keys")({
  component: KeysPage,
});

function KeysPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<{ data: Array<{ id: string; prefix: string; createdAt: string }> }>("/api-keys"),
  });

  const create = useMutation({
    mutationFn: () => api.post<{ data: { key: string } }>("/api-keys", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>API Keys</h1>
      <button onClick={() => create.mutate()} disabled={create.isPending}>
        {create.isPending ? "Creating..." : "Create key"}
      </button>
      {create.data && (
        <p>
          New key (copy now — shown once): <code>{create.data.data.key}</code>
        </p>
      )}
      <ul>
        {data?.data.map((k) => (
          <li key={k.id}>
            <code>{k.prefix}...</code>
            <button onClick={() => revoke.mutate(k.id)}>Revoke</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

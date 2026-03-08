import { api } from "@maschina/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  agentType: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  status: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  agentType: string;
  config?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

const AGENTS_KEY = ["agents"] as const;

export function useAgents() {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: [...AGENTS_KEY, id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export function useAgentRuns(agentId: string) {
  return useQuery({
    queryKey: [...AGENTS_KEY, agentId, "runs"],
    queryFn: () => api.get<AgentRun[]>(`/agents/${agentId}/runs`),
    enabled: !!agentId,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAgentInput) => api.patch<Agent>(`/agents/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.post<AgentRun>(`/agents/${id}/run`, input),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: [...AGENTS_KEY, id, "runs"] }),
  });
}

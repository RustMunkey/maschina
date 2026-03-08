import { api } from "@maschina/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface CreateKeyInput {
  name: string;
  expiresAt?: string;
}

export interface CreateKeyResponse extends ApiKey {
  key: string; // raw key — only returned once
}

const KEYS_KEY = ["keys"] as const;

export function useKeys() {
  return useQuery({
    queryKey: KEYS_KEY,
    queryFn: () => api.get<ApiKey[]>("/keys"),
  });
}

export function useCreateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKeyInput) => api.post<CreateKeyResponse>("/keys", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}

export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}

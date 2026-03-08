import { api } from "@maschina/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface User {
  id: string;
  name: string | null;
  email: string;
  tier: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UpdateUserInput {
  name?: string;
}

const ME_KEY = ["users", "me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<User>("/users/me"),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => api.patch<User>("/users/me", input),
    onSuccess: (data) => qc.setQueryData(ME_KEY, data),
  });
}

// Admin only
export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });
}

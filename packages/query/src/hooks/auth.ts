import { api, token } from "@maschina/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    tier: string;
  };
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthResponse>("/auth/login", input),
    onSuccess: (data) => token.set(data.token),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<AuthResponse>("/auth/register", input),
    onSuccess: (data) => token.set(data.token),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSettled: () => {
      token.clear();
      qc.clear();
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post<void>("/auth/forgot-password", { email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ resetToken, password }: { resetToken: string; password: string }) =>
      api.post<void>("/auth/reset-password", { token: resetToken, password }),
  });
}

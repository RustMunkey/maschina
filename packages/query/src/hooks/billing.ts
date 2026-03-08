import { api } from "@maschina/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Subscription {
  id: string;
  tier: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface Credits {
  balance: number; // cents
  currency: string;
}

export interface CheckoutInput {
  tier: string;
  interval?: "month" | "year";
  returnUrl: string;
}

export interface CheckoutResponse {
  url: string;
}

const BILLING_KEY = ["billing"] as const;

export function useSubscription() {
  return useQuery({
    queryKey: [...BILLING_KEY, "subscription"],
    queryFn: () => api.get<Subscription | null>("/billing/subscription"),
  });
}

export function useCredits() {
  return useQuery({
    queryKey: [...BILLING_KEY, "credits"],
    queryFn: () => api.get<Credits>("/billing/credits"),
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: CheckoutInput) => api.post<CheckoutResponse>("/billing/checkout", input),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/billing/subscription/cancel"),
    onSuccess: () => qc.invalidateQueries({ queryKey: BILLING_KEY }),
  });
}

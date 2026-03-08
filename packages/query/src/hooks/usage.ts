import { useQuery } from "@tanstack/react-query";
import { api } from "@maschina/api-client";

export interface UsageSummary {
  tier: string;
  period: string;
  quotas: {
    monthlyAgentRuns: { used: number; limit: number | null };
    monthlyModelTokens: { used: number; limit: number | null };
    concurrentAgents: { used: number; limit: number | null };
    apiCallsPerMinute: { used: number; limit: number | null };
  };
}

export interface UsageEvent {
  id: string;
  metric: string;
  quantity: number;
  recordedAt: string;
}

export function useUsageSummary() {
  return useQuery({
    queryKey: ["usage", "summary"],
    queryFn: () => api.get<UsageSummary>("/usage/summary"),
    staleTime: 60_000,
  });
}

export function useUsageEvents(metric?: string) {
  return useQuery({
    queryKey: ["usage", "events", metric],
    queryFn: () =>
      api.get<UsageEvent[]>(`/usage${metric ? `?metric=${metric}` : ""}`),
  });
}

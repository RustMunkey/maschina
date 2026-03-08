// Types
export type {
  UsageEventType,
  RecordUsageInput,
  QuotaCheckResult,
  UsageSummary,
  PeriodUsage,
  RateLimitHeaders,
} from "./types.js";

// Period helpers
export { getCurrentPeriod, getPeriodForDate, secondsUntilPeriodEnd } from "./period.js";

// Redis key schema
export { quotaKey, allQuotaKeys, sessionKey, planKey, userPlanKey } from "./keys.js";

// Quota checking (reads Redis → falls back to PostgreSQL)
export { checkQuota, incrementQuota, getUsageSummary, buildRateLimitHeaders } from "./quota.js";

// Event recording (Redis increment + PostgreSQL append)
export {
  recordUsage,
  recordModelInference,
  recordAgentExecution,
  recordApiCall,
} from "./record.js";

// Storage quota (PostgreSQL snapshot — not Redis)
export {
  getStorageUsageBytes,
  getStorageUsageGb,
  checkStorageQuota,
} from "./storage.js";

// Reconciliation (nightly cron — called from services/api or services/worker)
export { reconcileUserUsage, reconcileAllUsers } from "./reconcile.js";

// Middleware helpers
export {
  QuotaExceededError,
  enforceQuota,
  enforceAndRecordApiCall,
} from "./middleware.js";

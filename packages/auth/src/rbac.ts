import { InsufficientRoleError } from "./errors.js";
import type { AuthContext, PlanTier, UserRole } from "./types.js";

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY: UserRole[] = ["viewer", "member", "admin", "owner"];

const PLAN_HIERARCHY: PlanTier[] = ["access", "m1", "m5", "m10", "teams", "enterprise", "internal"];

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

export function hasPlan(userPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_HIERARCHY.indexOf(userPlan) >= PLAN_HIERARCHY.indexOf(requiredPlan);
}

export function requireRole(ctx: AuthContext, role: UserRole): void {
  if (!hasRole(ctx.role, role)) throw new InsufficientRoleError(role);
}

export function requirePlan(ctx: AuthContext, plan: PlanTier): void {
  if (!hasPlan(ctx.plan, plan)) {
    throw new InsufficientRoleError(`plan:${plan}`);
  }
}

export function requireOwner(ctx: AuthContext): void {
  requireRole(ctx, "owner");
}

export function requireAdmin(ctx: AuthContext): void {
  requireRole(ctx, "admin");
}

export function requireSelfOrAdmin(ctx: AuthContext, resourceUserId: string): void {
  if (ctx.userId !== resourceUserId && !hasRole(ctx.role, "admin")) {
    throw new InsufficientRoleError("admin");
  }
}

// Plan-based feature gates
export const planFeatures = {
  canUseApiKeys: (plan: PlanTier) => hasPlan(plan, "m1"),
  canDeployMultipleAgents: (plan: PlanTier) => hasPlan(plan, "m1"),
  canInviteTeamMembers: (plan: PlanTier) => hasPlan(plan, "teams"),
  canAccessAnalytics: (plan: PlanTier) => hasPlan(plan, "m1"),
  canAccessCompliance: (plan: PlanTier) => hasPlan(plan, "enterprise"),
  canUseCustomConnectors: (plan: PlanTier) => hasPlan(plan, "m5"),
  hasUnlimitedAgents: (plan: PlanTier) => hasPlan(plan, "enterprise"),
  hasPrioritySupport: (plan: PlanTier) => hasPlan(plan, "m5"),
} as const;

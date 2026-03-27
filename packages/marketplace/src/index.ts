import type { MarketplaceListing } from "@maschina/db";

// ─── Revenue share ────────────────────────────────────────────────────────────
//
// Two models:
//
// 1. Marketplace listing sale (fiat/Stripe) — calcRevenueShare()
//    Agent creator publishes a listing; buyer pays once to fork the agent.
//    70% to seller (agent creator), 30% to platform.
//
// 2. Per-execution task revenue (on-chain/token) — calcExecutionRevenue()
//    Used when a node executes a task on behalf of an agent. Mirrors the
//    architecture's economic model: node runner earns compute revenue, developer
//    earns usage royalty, platform treasury accumulates protocol fees,
//    validators receive a small participation reward.
//    70% node runner / 15% treasury / 10% developer / 5% validators

// ── Listing sale (fiat) ───────────────────────────────────────────────────────

const LISTING_SELLER_SHARE = 0.7;

export interface RevenueShare {
  sellerCents: number;
  platformCents: number;
}

export function calcRevenueShare(totalCents: number): RevenueShare {
  const sellerCents = Math.floor(totalCents * LISTING_SELLER_SHARE);
  return {
    sellerCents,
    platformCents: totalCents - sellerCents,
  };
}

// ── Per-execution task revenue (on-chain) ────────────────────────────────────
//
// Split (decided 2026-03-27, see .claude/ECONOMICS.md):
//   70% node runner  — the machine that executed the job
//   15% treasury     — protocol sustainability, grants, buybacks, governance
//   10% developer    — agent template author (marketplace listing owner)
//    5% validators   — nodes that verified honest completion
//
// The 10% developer royalty only applies to published marketplace templates.
// For first-party/internal agents, pass withDeveloper: false and that 10%
// rolls into treasury (giving treasury 25% total).
//
// Milestone: node runner share rises to 75% once the network reaches 100
// active node runners. Treasury absorbs the 5% reduction. Requires governance
// vote. The split constants below must not be changed without updating
// the Solana settlement program and governance parameters.

const EXECUTION_NODE_SHARE = 0.7;
const EXECUTION_DEVELOPER_SHARE = 0.1;
const EXECUTION_TREASURY_SHARE = 0.15;
// validator share = remainder (0.05) to avoid floating-point drift

export interface ExecutionRevenue {
  nodeCents: number; // 70% — node runner that executed the job
  developerCents: number; // 10% — agent template author (0 if first-party)
  treasuryCents: number; // 15% — protocol treasury (25% if no developer)
  validatorCents: number; //  5% — validator nodes
}

export function calcExecutionRevenue(totalCents: number, withDeveloper = true): ExecutionRevenue {
  const nodeCents = Math.floor(totalCents * EXECUTION_NODE_SHARE);
  const developerCents = withDeveloper ? Math.floor(totalCents * EXECUTION_DEVELOPER_SHARE) : 0;
  const validatorCents = Math.floor(totalCents * 0.05);
  const treasuryCents = totalCents - nodeCents - developerCents - validatorCents;
  return { nodeCents, developerCents, treasuryCents, validatorCents };
}

// ─── Meilisearch document shape ───────────────────────────────────────────────

export interface ListingDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  rating: number | null;
  reputationScore: number;
  downloads: number;
  sellerId: string;
  slug: string;
  createdAt: string;
}

export function listingToDoc(
  listing: MarketplaceListing,
  agentReputationScore?: number | null,
): ListingDoc {
  return {
    id: listing.id,
    name: listing.name,
    description: listing.description ?? "",
    category: listing.category,
    tags: Array.isArray(listing.tags) ? (listing.tags as string[]) : [],
    rating: listing.rating ? Number(listing.rating) : null,
    reputationScore: agentReputationScore != null ? Number(agentReputationScore) : 50,
    downloads: listing.downloads,
    sellerId: listing.sellerId,
    slug: listing.slug,
    createdAt: listing.createdAt.toISOString(),
  };
}

// ─── Slug generation ──────────────────────────────────────────────────────────

export function generateSlug(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base}-${suffix}`;
}

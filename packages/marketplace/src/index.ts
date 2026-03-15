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
//    architecture's economic model: node earns compute revenue, developer
//    earns usage royalty, platform treasury accumulates protocol fees,
//    validators receive a small participation reward.
//    65% node / 20% developer / 10% treasury / 5% validators

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

const EXECUTION_NODE_SHARE = 0.65;
const EXECUTION_DEVELOPER_SHARE = 0.2;
const EXECUTION_TREASURY_SHARE = 0.1;
// validator share = remainder (0.05) to avoid floating-point drift

export interface ExecutionRevenue {
  nodeCents: number; // 65% — compute node operator
  developerCents: number; // 20% — agent developer (marketplace listing owner)
  treasuryCents: number; // 10% — protocol treasury
  validatorCents: number; //  5% — validator nodes
}

export function calcExecutionRevenue(totalCents: number): ExecutionRevenue {
  const nodeCents = Math.floor(totalCents * EXECUTION_NODE_SHARE);
  const developerCents = Math.floor(totalCents * EXECUTION_DEVELOPER_SHARE);
  const treasuryCents = Math.floor(totalCents * EXECUTION_TREASURY_SHARE);
  const validatorCents = totalCents - nodeCents - developerCents - treasuryCents;
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

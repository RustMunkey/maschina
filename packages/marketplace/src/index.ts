import type { MarketplaceListing } from "@maschina/db";

// ─── Revenue share ────────────────────────────────────────────────────────────

const SELLER_SHARE = 0.7;
const PLATFORM_SHARE = 0.3;

export interface RevenueShare {
  sellerCents: number;
  platformCents: number;
}

export function calcRevenueShare(totalCents: number): RevenueShare {
  const sellerCents = Math.floor(totalCents * SELLER_SHARE);
  return {
    sellerCents,
    platformCents: totalCents - sellerCents,
  };
}

// ─── Meilisearch document shape ───────────────────────────────────────────────

export interface ListingDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  rating: number | null;
  downloads: number;
  sellerId: string;
  slug: string;
  createdAt: string;
}

export function listingToDoc(listing: MarketplaceListing): ListingDoc {
  return {
    id: listing.id,
    name: listing.name,
    description: listing.description ?? "",
    category: listing.category,
    tags: Array.isArray(listing.tags) ? (listing.tags as string[]) : [],
    rating: listing.rating ? Number(listing.rating) : null,
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

import { createMarketplacePaymentIntent } from "@maschina/billing";
import { db } from "@maschina/db";
import {
  agents,
  creditTransactions,
  marketplaceListings,
  marketplaceOrders,
  marketplaceReviews,
} from "@maschina/db";
import { and, desc, eq, isNull, like, sum } from "@maschina/db";
import { generateSlug, listingToDoc } from "@maschina/marketplace";
import { deleteDocument, search, upsertDocument } from "@maschina/search";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateListingSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(50),
  tags: z.array(z.string()).max(10).default([]),
});

const UpdateListingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(50).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
});

// ─── GET /marketplace ─────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const category = c.req.query("category");
  const sort = c.req.query("sort") ?? "downloads:desc";
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  try {
    const filter = ['status = "active"', category ? `category = "${category}"` : null]
      .filter(Boolean)
      .join(" AND ");

    const results = await search("marketplace", q, { limit, offset, filter, sort: [sort] });
    return c.json(results);
  } catch {
    // Meilisearch down — fall back to DB
    const rows = await db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.status, "active"),
          category ? eq(marketplaceListings.category, category) : undefined,
        ),
      )
      .orderBy(desc(marketplaceListings.downloads))
      .limit(limit)
      .offset(offset);

    return c.json({ hits: rows, total: rows.length, query: q, processingTimeMs: 0 });
  }
});

// ─── GET /marketplace/:id ─────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, id))
    .limit(1);

  if (!listing) throw new HTTPException(404, { message: "Listing not found" });

  const reviews = await db
    .select()
    .from(marketplaceReviews)
    .where(eq(marketplaceReviews.listingId, id))
    .orderBy(desc(marketplaceReviews.createdAt))
    .limit(20);

  return c.json({ ...listing, reviews });
});

// ─── POST /marketplace/listings — create draft ────────────────────────────────

app.post("/listings", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateListingSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  // Verify the agent belongs to this user
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, parsed.data.agentId), eq(agents.userId, userId), isNull(agents.deletedAt)),
    )
    .limit(1);

  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  const slug = generateSlug(parsed.data.name, Math.random().toString(36).slice(2, 8));

  const [listing] = await db
    .insert(marketplaceListings)
    .values({
      sellerId: userId,
      agentId: agent.id,
      agentConfig: agent.config ?? {},
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      tags: parsed.data.tags,
      status: "draft",
    })
    .returning();

  return c.json(listing, 201);
});

// ─── PATCH /marketplace/listings/:id — update draft ───────────────────────────

app.patch("/listings/:id", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const listingId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateListingSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [existing] = await db
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.sellerId, userId)))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Listing not found" });
  if (existing.status === "active") {
    throw new HTTPException(400, { message: "Cannot edit an active listing. Unpublish it first." });
  }

  const updates: Partial<typeof marketplaceListings.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;

  const [updated] = await db
    .update(marketplaceListings)
    .set(updates)
    .where(eq(marketplaceListings.id, listingId))
    .returning();

  return c.json(updated);
});

// ─── POST /marketplace/listings/:id/publish ───────────────────────────────────

app.post("/listings/:id/publish", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const listingId = c.req.param("id");

  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.sellerId, userId)))
    .limit(1);

  if (!listing) throw new HTTPException(404, { message: "Listing not found" });
  if (listing.status === "active") {
    throw new HTTPException(400, { message: "Listing is already active" });
  }

  const [published] = await db
    .update(marketplaceListings)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId))
    .returning();

  // Fetch agent reputation score to include in search document
  let agentReputationScore: number | null = null;
  if (published.agentId) {
    const [agent] = await db
      .select({ reputationScore: agents.reputationScore })
      .from(agents)
      .where(eq(agents.id, published.agentId))
      .limit(1);
    agentReputationScore = agent ? Number(agent.reputationScore) : null;
  }

  // Sync to Meilisearch
  upsertDocument(
    "marketplace",
    listingToDoc(published, agentReputationScore) as unknown as Record<string, unknown> & {
      id: string;
    },
  ).catch(() => {});

  return c.json(published);
});

// ─── POST /marketplace/listings/:id/unpublish ─────────────────────────────────

app.post("/listings/:id/unpublish", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const listingId = c.req.param("id");

  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(
      role === "admin"
        ? eq(marketplaceListings.id, listingId)
        : and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.sellerId, userId)),
    )
    .limit(1);

  if (!listing) throw new HTTPException(404, { message: "Listing not found" });

  const [unpublished] = await db
    .update(marketplaceListings)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId))
    .returning();

  deleteDocument("marketplace", listingId).catch(() => {});

  return c.json(unpublished);
});

// ─── POST /marketplace/listings/:id/fork ─────────────────────────────────────
// Copies the agent config as a new agent owned by the requesting user.

app.post("/listings/:id/fork", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const listingId = c.req.param("id");

  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.status, "active")))
    .limit(1);

  if (!listing) throw new HTTPException(404, { message: "Listing not found or not active" });

  // Create a forked agent from the config snapshot
  const [forked] = await db
    .insert(agents)
    .values({
      userId,
      name: `${listing.name} (fork)`,
      description: listing.description ?? null,
      type:
        ((listing.agentConfig as Record<string, unknown>)
          ?.type as (typeof agents.$inferInsert)["type"]) ?? "execution",
      config: listing.agentConfig ?? {},
      status: "idle",
    })
    .returning();

  // Increment download count
  await db
    .update(marketplaceListings)
    .set({ downloads: listing.downloads + 1, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId));

  // Record as a free order
  await db.insert(marketplaceOrders).values({
    listingId,
    buyerId: userId,
    sellerId: listing.sellerId,
    status: "completed",
    amountUsd: 0,
    completedAt: new Date(),
  });

  return c.json({ agent: forked, listingId }, 201);
});

// ─── POST /marketplace/listings/:id/reviews ───────────────────────────────────

app.post("/listings/:id/reviews", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const listingId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  // Must have a completed order to review
  const [order] = await db
    .select({ id: marketplaceOrders.id })
    .from(marketplaceOrders)
    .where(
      and(
        eq(marketplaceOrders.listingId, listingId),
        eq(marketplaceOrders.buyerId, userId),
        eq(marketplaceOrders.status, "completed"),
      ),
    )
    .limit(1);

  if (!order) {
    throw new HTTPException(403, { message: "You must fork this agent before reviewing it" });
  }

  const [review] = await db
    .insert(marketplaceReviews)
    .values({
      listingId,
      reviewerId: userId,
      orderId: order.id,
      rating: parsed.data.rating,
      body: parsed.data.body ?? null,
    })
    .returning();

  // Recalculate aggregate rating
  const all = await db
    .select({ rating: marketplaceReviews.rating })
    .from(marketplaceReviews)
    .where(eq(marketplaceReviews.listingId, listingId));

  const avg = all.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / all.length;

  await db
    .update(marketplaceListings)
    .set({
      rating: avg.toFixed(2),
      ratingCount: all.length,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListings.id, listingId));

  return c.json(review, 201);
});

// ─── GET /marketplace/listings/mine ───────────────────────────────────────────

app.get("/listings/mine", requireAuth, async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.sellerId, userId))
    .orderBy(desc(marketplaceListings.createdAt));

  return c.json(rows);
});

// ─── POST /marketplace/listings/:id/buy ───────────────────────────────────────
// Creates a Stripe PaymentIntent for a paid listing.
// Returns clientSecret for the frontend to confirm with Stripe.js.
// Fulfillment (agent fork + seller credit) fires in payment_intent.succeeded webhook.

app.post("/listings/:id/buy", requireAuth, async (c) => {
  const { id: userId, email } = c.get("user");
  const listingId = c.req.param("id");

  const result = await createMarketplacePaymentIntent({
    buyerId: userId,
    buyerEmail: email,
    listingId,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Payment setup failed";
    throw new HTTPException(400, { message: msg });
  });

  return c.json(result, 201);
});

// ─── GET /marketplace/orders ──────────────────────────────────────────────────
// Returns the authenticated user's purchase history (as buyer).

app.get("/orders", requireAuth, async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select({
      id: marketplaceOrders.id,
      listingId: marketplaceOrders.listingId,
      listingName: marketplaceListings.name,
      status: marketplaceOrders.status,
      amountUsd: marketplaceOrders.amountUsd,
      stripePaymentIntentId: marketplaceOrders.stripePaymentIntentId,
      createdAt: marketplaceOrders.createdAt,
      completedAt: marketplaceOrders.completedAt,
    })
    .from(marketplaceOrders)
    .innerJoin(marketplaceListings, eq(marketplaceOrders.listingId, marketplaceListings.id))
    .where(eq(marketplaceOrders.buyerId, userId))
    .orderBy(desc(marketplaceOrders.createdAt));

  return c.json(rows);
});

// ─── GET /marketplace/earnings ────────────────────────────────────────────────
// Returns the authenticated user's seller earnings from marketplace sales.

app.get("/earnings", requireAuth, async (c) => {
  const { id: userId } = c.get("user");

  // All credit_transactions with description matching marketplace sales
  const rows = await db
    .select({
      id: creditTransactions.id,
      amount: creditTransactions.amount,
      description: creditTransactions.description,
      createdAt: creditTransactions.createdAt,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        like(creditTransactions.description, "Marketplace sale:%"),
      ),
    )
    .orderBy(desc(creditTransactions.createdAt));

  const [totals] = await db
    .select({ totalEarnedCents: sum(creditTransactions.amount) })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        like(creditTransactions.description, "Marketplace sale:%"),
      ),
    );

  return c.json({
    totalEarnedCents: Number(totals?.totalEarnedCents ?? 0),
    transactions: rows,
  });
});

export default app;

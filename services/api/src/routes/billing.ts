import {
  MIN_TOPUP_CENTS,
  TOPUP_OPTIONS,
  cancelSubscription,
  changeSubscriptionTier,
  createCreditCheckout,
  createPortalSession,
  createSubscriptionCheckout,
  getCreditBalance,
  getOrCreateStripeCustomer,
} from "@maschina/billing";
import { db } from "@maschina/db";
import { creditTransactions, plans, subscriptions } from "@maschina/db";
import { desc, eq } from "@maschina/db";
import { isCustomPricing, isValidTier } from "@maschina/plans";
import { assertValid } from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// GET /billing/subscription
app.get("/subscription", async (c) => {
  const { id } = c.get("user");

  const [sub] = await db
    .select({
      status: subscriptions.status,
      interval: subscriptions.interval,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      planName: plans.name,
      tier: plans.tier,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, id))
    .limit(1);

  if (!sub) return c.json({ tier: "access", status: "active", message: "No paid subscription" });

  return c.json({
    tier: sub.tier,
    planName: sub.planName,
    status: sub.status,
    interval: sub.interval,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  });
});

// POST /billing/checkout  — start a new subscription
app.post("/checkout", async (c) => {
  const user = c.get("user");
  const body = assertValid(
    z.object({
      tier: z.string(),
      interval: z.enum(["monthly", "annual"]).default("monthly"),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }),
    await c.req.json().catch(() => null),
  );

  if (!isValidTier(body.tier) || body.tier === "access" || body.tier === "internal") {
    throw new HTTPException(400, { message: "Invalid plan tier" });
  }
  if (isCustomPricing(body.tier)) {
    throw new HTTPException(400, { message: "Enterprise plans require contacting sales" });
  }

  const result = await createSubscriptionCheckout({
    userId: user.id,
    email: user.email,
    tier: body.tier,
    interval: body.interval as "monthly" | "annual",
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl,
  });

  return c.json(result);
});

// POST /billing/change — upgrade or downgrade plan
app.post("/change", async (c) => {
  const user = c.get("user");
  const body = assertValid(
    z.object({
      tier: z.string(),
      interval: z.enum(["monthly", "annual"]).default("monthly"),
    }),
    await c.req.json().catch(() => null),
  );

  if (!isValidTier(body.tier) || body.tier === "access" || body.tier === "internal") {
    throw new HTTPException(400, { message: "Invalid plan tier" });
  }

  const result = await changeSubscriptionTier({
    userId: user.id,
    newTier: body.tier,
    interval: body.interval as "monthly" | "annual",
  });

  return c.json(result);
});

// POST /billing/cancel
app.post("/cancel", async (c) => {
  const { id } = c.get("user");
  await cancelSubscription(id);
  return c.json({
    success: true,
    message: "Subscription will cancel at the end of the current period",
  });
});

// POST /billing/portal — Stripe Customer Portal for self-serve management
app.post("/portal", async (c) => {
  const user = c.get("user");
  if (user.tier === "access" || user.tier === "internal") {
    throw new HTTPException(400, { message: "No billing portal available for this plan" });
  }
  const body = assertValid(
    z.object({ returnUrl: z.string().url() }),
    await c.req.json().catch(() => null),
  );

  const result = await createPortalSession({ userId: user.id, returnUrl: body.returnUrl });
  return c.json(result);
});

// GET /billing/balance
app.get("/balance", async (c) => {
  const { id } = c.get("user");
  const balanceCents = await getCreditBalance(id);
  return c.json({
    balanceCents,
    balanceFormatted: `$${(balanceCents / 100).toFixed(2)}`,
  });
});

// GET /billing/topup-options
app.get("/topup-options", (c) => {
  return c.json({
    minimumCents: MIN_TOPUP_CENTS,
    options: TOPUP_OPTIONS.map(({ id, displayAmount, cents }) => ({ id, displayAmount, cents })),
  });
});

// POST /billing/topup — start a top-up checkout session
app.post("/topup", async (c) => {
  const user = c.get("user");
  const body = assertValid(
    z.object({
      optionId: z.string(),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }),
    await c.req.json().catch(() => null),
  );

  const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email);

  const result = await createCreditCheckout({
    userId: user.id,
    stripeCustomerId,
    packageId: body.optionId,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl,
  });

  return c.json(result);
});

// GET /billing/history — credit transaction history
app.get("/history", async (c) => {
  const { id } = c.get("user");

  const rows = await db
    .select({
      id: creditTransactions.id,
      type: creditTransactions.type,
      amount: creditTransactions.amount,
      balanceAfter: creditTransactions.balanceAfter,
      description: creditTransactions.description,
      createdAt: creditTransactions.createdAt,
    })
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, id))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(50);

  type TxRow = (typeof rows)[number];
  return c.json(
    rows.map((r: TxRow) => ({
      ...r,
      amountFormatted: `${(r.amount ?? 0) >= 0 ? "+" : ""}$${((r.amount ?? 0) / 100).toFixed(2)}`,
      balanceAfterFormatted: `$${((r.balanceAfter ?? 0) / 100).toFixed(2)}`,
    })),
  );
});

export default app;

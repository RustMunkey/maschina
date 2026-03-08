import { db } from "@maschina/db";
import { creditTransactions, creditBalances } from "@maschina/db";
import { eq, sql } from "@maschina/db";
import { getStripe } from "./client.js";
import { CREDIT_PACKAGES, type CheckoutResult } from "./types.js";

// ─── Credit top-up via Stripe Checkout ───────────────────────────────────────
// Credits are consumed before plan quota — users with credits never hit a hard wall.
// One-time payment, not a subscription.

export async function createCreditCheckout(opts: {
  userId: string;
  stripeCustomerId: string;
  packageId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const pkg = CREDIT_PACKAGES.find((p) => p.id === opts.packageId);
  if (!pkg) throw new Error(`Unknown credit package: ${opts.packageId}`);
  if (!pkg.stripePriceId) throw new Error(`Stripe price not configured for package: ${opts.packageId}`);

  const session = await getStripe().checkout.sessions.create({
    customer: opts.stripeCustomerId,
    mode: "payment",
    line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    payment_intent_data: {
      metadata: {
        maschinaUserId: opts.userId,
        creditPackageId: pkg.id,
        tokens: String(pkg.tokens),
      },
    },
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

// ─── Credit ledger operations ─────────────────────────────────────────────────
// append-only ledger + denormalized balance updated atomically in a transaction.

export async function getCreditBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: creditBalances.balance })
    .from(creditBalances)
    .where(eq(creditBalances.userId, userId));

  return row?.balance ?? 0;
}

export async function addCredits(opts: {
  userId: string;
  tokens: number;
  stripePaymentIntentId: string;
  description: string;
}): Promise<number> {
  // Upsert balance + append ledger entry in a transaction
  const newBalance = await db.transaction(async (tx: any) => {
    // Upsert balance row
    await tx
      .insert(creditBalances)
      .values({ userId: opts.userId, balance: opts.tokens, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: creditBalances.userId,
        set: {
          balance: sql`${creditBalances.balance} + ${opts.tokens}`,
          updatedAt: new Date(),
        },
      });

    const [updated] = await tx
      .select({ balance: creditBalances.balance })
      .from(creditBalances)
      .where(eq(creditBalances.userId, opts.userId));

    const balance = updated!.balance;

    // Append to ledger (append-only, never update)
    await tx.insert(creditTransactions).values({
      userId:                opts.userId,
      type:                  "purchase",
      amount:                opts.tokens,
      balanceAfter:          balance,
      stripePaymentIntentId: opts.stripePaymentIntentId,
      description:           opts.description,
    });

    return balance;
  });

  return newBalance;
}

export async function consumeCredits(opts: {
  userId: string;
  tokens: number;
  description: string;
}): Promise<{ consumed: number; remaining: number }> {
  const balance = await getCreditBalance(opts.userId);
  if (balance <= 0) return { consumed: 0, remaining: 0 };

  const consumed = Math.min(balance, opts.tokens);

  await db.transaction(async (tx: any) => {
    await tx
      .update(creditBalances)
      .set({
        balance: sql`${creditBalances.balance} - ${consumed}`,
        updatedAt: new Date(),
      })
      .where(eq(creditBalances.userId, opts.userId));

    const [updated] = await tx
      .select({ balance: creditBalances.balance })
      .from(creditBalances)
      .where(eq(creditBalances.userId, opts.userId));

    await tx.insert(creditTransactions).values({
      userId:       opts.userId,
      type:         "usage",
      amount:       -consumed,
      balanceAfter: updated!.balance,
      description:  opts.description,
    });
  });

  return { consumed, remaining: balance - consumed };
}

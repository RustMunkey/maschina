import { db } from "@maschina/db";
import { subscriptions, users } from "@maschina/db";
import { eq } from "@maschina/db";
import { getStripe } from "./client.js";

// ─── Stripe customer management ───────────────────────────────────────────────
// One Stripe customer per Maschina user. Created lazily on first paid action.
// stripeCustomerId is stored on the subscription row.

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string | null,
): Promise<string> {
  const stripe = getStripe();

  // Check if customer already exists in our DB
  const [existing] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: {
      maschinaUserId: userId,
    },
  });

  return customer.id;
}

/** Sync email/name changes to Stripe (call on profile update) */
export async function updateStripeCustomer(
  stripeCustomerId: string,
  updates: { email?: string; name?: string },
): Promise<void> {
  await getStripe().customers.update(stripeCustomerId, updates);
}

import { sql } from '../db';

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan_type: 'basic' | 'intermediate' | 'advanced';
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  credits_per_month: number;
  price_cents: number;
  created_at: Date;
  cancelled_at: Date | null;
}

export const PLAN_CREDITS: Record<string, number> = {
  basic: 30,
  intermediate: 100,
  advanced: 300,
};

export const PLAN_PRICES: Record<string, number> = {
  basic: 1900,
  intermediate: 4900,
  advanced: 9900,
};

export async function createSubscription(
  userId: string,
  planType: 'basic' | 'intermediate' | 'advanced'
): Promise<SubscriptionRecord> {
  const credits = PLAN_CREDITS[planType];
  const price = PLAN_PRICES[planType];
  const [row] = await sql<SubscriptionRecord[]>`
    INSERT INTO subscriptions (user_id, plan_type, status, credits_per_month, price_cents)
    VALUES (${userId}, ${planType}, 'active', ${credits}, ${price})
    RETURNING id, user_id, plan_type, status, credits_per_month, price_cents, created_at, cancelled_at
  `;
  return row;
}

export async function cancelSubscription(id: string): Promise<void> {
  await sql`
    UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = ${id}
  `;
}

export async function expireSubscription(id: string): Promise<void> {
  await sql`
    UPDATE subscriptions SET status = 'expired'
    WHERE id = ${id}
  `;
}

export async function pauseSubscription(id: string): Promise<void> {
  await sql`
    UPDATE subscriptions SET status = 'paused'
    WHERE id = ${id}
  `;
}

export async function getActiveSubscription(
  userId: string
): Promise<SubscriptionRecord | null> {
  const [row] = await sql<SubscriptionRecord[]>`
    SELECT id, user_id, plan_type, status, credits_per_month, price_cents, created_at, cancelled_at
    FROM subscriptions
    WHERE user_id = ${userId} AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

export async function getSubscriptionById(
  id: string
): Promise<SubscriptionRecord | null> {
  const [row] = await sql<SubscriptionRecord[]>`
    SELECT id, user_id, plan_type, status, credits_per_month, price_cents, created_at, cancelled_at
    FROM subscriptions WHERE id = ${id}
  `;
  return row ?? null;
}

export async function listUserSubscriptions(
  userId: string
): Promise<SubscriptionRecord[]> {
  return sql<SubscriptionRecord[]>`
    SELECT id, user_id, plan_type, status, credits_per_month, price_cents, created_at, cancelled_at
    FROM subscriptions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function allocateSubscriptionCredits(
  userId: string,
  planType: string
): Promise<void> {
  const credits = PLAN_CREDITS[planType];
  await sql.begin(async (trx) => {
    const [updated] = await trx<{ balance: number }[]>`
      UPDATE credits SET balance = balance + ${credits}, updated_at = NOW()
      WHERE user_id = ${userId} AND balance + ${credits} <= 5000
      RETURNING balance
    `;

    if (!updated) {
      console.log('[subscriptions] Credit cap reached for user:', userId, '— skipping allocation for plan:', planType);
      return;
    }

    await trx`
      INSERT INTO credit_transactions (user_id, amount, type, notes)
      VALUES (${userId}, ${credits}, 'subscription_credit', ${`Plan: ${planType}`})
    `;
  });
}

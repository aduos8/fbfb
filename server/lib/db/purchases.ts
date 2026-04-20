import { sql } from '../db';

export interface PurchaseRecord {
  id: string;
  user_id: string;
  amount_cents: number;
  credits_purchased: number;
  oxapay_track_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: Date;
  completed_at: Date | null;
}

export async function createPurchase(
  userId: string,
  amountCents: number,
  creditsPurchased: number,
  oxapayTrackId: string | null
): Promise<PurchaseRecord> {
  const [row] = await sql<PurchaseRecord[]>`
    INSERT INTO purchases (user_id, amount_cents, credits_purchased, oxapay_track_id, status)
    VALUES (${userId}, ${amountCents}, ${creditsPurchased}, ${oxapayTrackId}, 'pending')
    RETURNING id, user_id, amount_cents, credits_purchased, oxapay_track_id, status, created_at, completed_at
  `;
  return row;
}

export async function completePurchase(id: string): Promise<void> {
  await sql`
    UPDATE purchases SET status = 'completed', completed_at = NOW()
    WHERE id = ${id}
  `;
}

export async function failPurchase(id: string): Promise<void> {
  await sql`
    UPDATE purchases SET status = 'failed'
    WHERE id = ${id}
  `;
}

export async function getPurchaseById(id: string): Promise<PurchaseRecord | null> {
  const [row] = await sql<PurchaseRecord[]>`
    SELECT id, user_id, amount_cents, credits_purchased, oxapay_track_id, status, created_at, completed_at
    FROM purchases WHERE id = ${id}
  `;
  return row ?? null;
}

export async function getPurchaseByTrackId(
  trackId: string
): Promise<PurchaseRecord | null> {
  const [row] = await sql<PurchaseRecord[]>`
    SELECT id, user_id, amount_cents, credits_purchased, oxapay_track_id, status, created_at, completed_at
    FROM purchases WHERE oxapay_track_id = ${trackId}
  `;
  return row ?? null;
}

export async function listUserPurchases(
  userId: string,
  limit = 20,
  offset = 0
): Promise<PurchaseRecord[]> {
  return sql<PurchaseRecord[]>`
    SELECT id, user_id, amount_cents, credits_purchased, oxapay_track_id, status, created_at, completed_at
    FROM purchases
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

export async function listAllPurchases(
  limit = 20,
  offset = 0
): Promise<PurchaseRecord[]> {
  return sql<PurchaseRecord[]>`
    SELECT id, user_id, amount_cents, credits_purchased, oxapay_track_id, status, created_at, completed_at
    FROM purchases
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

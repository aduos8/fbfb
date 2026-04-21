import { sql } from '../db';

export interface PaymentSession {
  id: string;
  user_id: string;
  oxapay_track_id: string | null;
  type: 'purchase' | 'subscription' | 'addon';
  status: 'pending' | 'completed' | 'failed' | 'expired';
  order_id: string | null;
  amount_cents: number;
  credits: number;
  created_at: Date;
  expires_at: Date | null;
}

export async function createPaymentSession(
  userId: string,
  type: 'purchase' | 'subscription' | 'addon',
  amountCents: number,
  credits: number,
  orderId?: string
): Promise<PaymentSession> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const [row] = await sql<PaymentSession[]>`
    INSERT INTO payment_sessions (user_id, oxapay_track_id, type, status, order_id, amount_cents, credits, expires_at)
    VALUES (${userId}, NULL, ${type}, 'pending', ${orderId ?? null}, ${amountCents}, ${credits}, ${expiresAt})
    RETURNING id, user_id, oxapay_track_id, type, status, order_id, amount_cents, credits, created_at, expires_at
  `;
  return row;
}

export async function linkTrackIdToSession(
  sessionId: string,
  trackId: string,
  expiresAt: Date
): Promise<void> {
  await sql`
    UPDATE payment_sessions
    SET oxapay_track_id = ${trackId}, expires_at = ${expiresAt}
    WHERE id = ${sessionId}
  `;
}

export async function completePaymentSession(
  sessionId: string
): Promise<void> {
  await sql`
    UPDATE payment_sessions SET status = 'completed'
    WHERE id = ${sessionId}
  `;
}

export async function expirePaymentSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE payment_sessions SET status = 'expired'
    WHERE id = ${sessionId}
  `;
}

export async function failPaymentSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE payment_sessions SET status = 'failed'
    WHERE id = ${sessionId}
  `;
}

export async function getPaymentSessionByTrackId(
  trackId: string
): Promise<PaymentSession | null> {
  const [row] = await sql<PaymentSession[]>`
    SELECT id, user_id, oxapay_track_id, type, status, order_id, amount_cents, credits, created_at, expires_at
    FROM payment_sessions WHERE oxapay_track_id = ${trackId}
  `;
  return row ?? null;
}

export async function getExpiredPendingSessions(): Promise<PaymentSession[]> {
  return sql<PaymentSession[]>`
    SELECT id, user_id, oxapay_track_id, type, status, order_id, amount_cents, credits, created_at, expires_at
    FROM payment_sessions
    WHERE status = 'pending' AND expires_at < NOW()
  `;
}

export async function getPendingSessionByOrderId(
  orderId: string
): Promise<PaymentSession | null> {
  const [row] = await sql<PaymentSession[]>`
    SELECT id, user_id, oxapay_track_id, type, status, order_id, amount_cents, credits, created_at, expires_at
    FROM payment_sessions WHERE order_id = ${orderId} AND status = 'pending'
  `;
  return row ?? null;
}

import { getPaymentInfo, isPaidStatus } from '../../lib/oxapay';
import { getPaymentSessionByTrackId, completePaymentSession } from '../../lib/db/paymentSessions';
import { completePurchase, getPurchaseByTrackId } from '../../lib/db/purchases';
import { createSubscription, PLAN_CREDITS } from '../../lib/db/subscriptions';
import { sql } from '../../lib/db';
import type { Request, Response } from 'express';

function creditsToPlanType(credits: number): 'basic' | 'intermediate' | 'advanced' | null {
  if (credits === PLAN_CREDITS.basic) return 'basic';
  if (credits === PLAN_CREDITS.intermediate) return 'intermediate';
  if (credits === PLAN_CREDITS.advanced) return 'advanced';
  return null;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const trackId = body?.track_id;
  if (!trackId) {
    return res.status(400).json({ error: 'Missing track_id' });
  }

  console.log('[Oxapay Webhook] Processing track_id:', trackId);

  try {
    const session = await getPaymentSessionByTrackId(trackId);

    if (!session) {
      console.log('[Oxapay Webhook] Session not found for track_id:', trackId);
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(200).json({ ok: true, reason: 'already_processed' });
    }

    const info = await getPaymentInfo(trackId);
    console.log('[Oxapay Webhook] Payment status:', info.status);

    if (isPaidStatus(info.status)) {
      console.log('[Oxapay Webhook] Payment confirmed, adding credits:', session.credits, 'to user:', session.user_id);

      await sql.begin(async (trx) => {
        await trx`
          UPDATE credits SET balance = balance + ${session.credits}, updated_at = NOW()
          WHERE user_id = ${session.user_id}
        `;

        await trx`
          INSERT INTO credit_transactions (user_id, amount, type, reference, notes)
          VALUES (
            ${session.user_id},
            ${session.credits},
            'purchase',
            ${trackId},
            ${JSON.stringify({ session_type: session.type, order_id: session.order_id })}
          )
        `;
      });

      await completePaymentSession(session.id);

      if (session.type === 'subscription') {
        const planType = creditsToPlanType(session.credits);
        if (planType) {
          console.log('[Oxapay Webhook] Creating subscription for plan:', planType);
          await createSubscription(session.user_id, planType);
        }
      }

      if (session.type === 'purchase') {
        const purchase = await getPurchaseByTrackId(trackId);
        if (purchase) {
          await completePurchase(purchase.id);
        }
      }

      console.log('[Oxapay Webhook] Payment processed successfully');
    } else if (info.status === 'expired') {
      await sql`
        UPDATE payment_sessions SET status = 'expired' WHERE id = ${session.id}
      `;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Oxapay Webhook Error]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

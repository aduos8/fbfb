import { getPaymentInfo, isPaidStatus } from '../../lib/oxapay';
import { getPaymentSessionByTrackId, completePaymentSession } from '../../lib/db/paymentSessions';
import { completePurchase, getPurchaseByTrackId } from '../../lib/db/purchases';
import { createSubscription, PLAN_CREDITS } from '../../lib/db/subscriptions';
import { completeAddonPurchase, getAddonPurchaseBySessionId, grantEntitlement } from '../../lib/db/entitlements';
import { sql } from '../../lib/db';
import type { Request, Response } from 'express';

function creditsToPlanType(credits: number): 'basic' | 'intermediate' | 'advanced' | null {
  if (credits === PLAN_CREDITS.basic) return 'basic';
  if (credits === PLAN_CREDITS.intermediate) return 'intermediate';
  if (credits === PLAN_CREDITS.advanced) return 'advanced';
  return null;
}

function addonExpiryFromCode(code: string): Date | null {
  const timedAddons = new Set([
    "analytics-crossref",
    "analytics-heatmap",
    "tracking-monitor",
    "export-csv",
    "premium-filters",
    "export-pdf",
  ]);
  if (!timedAddons.has(code)) return null;
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  return expiresAt;
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
      console.log('[Oxapay Webhook] Payment confirmed for session type:', session.type, 'user:', session.user_id);

      if (session.credits > 0) {
        await sql.begin(async (trx) => {
          const [updated] = await trx<{ balance: number }[]>`
            UPDATE credits SET balance = balance + ${session.credits}, updated_at = NOW()
            WHERE user_id = ${session.user_id} AND balance + ${session.credits} <= 5000
            RETURNING balance
          `;

          if (!updated) {
            console.log('[Oxapay Webhook] Credit cap reached for user:', session.user_id, '— marking for manual handling');
            return;
          }

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
      }

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

      if (session.type === 'addon') {
        const addonPurchase = await getAddonPurchaseBySessionId(session.id);
        if (addonPurchase) {
          const entitlement = await grantEntitlement({
            userId: session.user_id,
            code: addonPurchase.addon_code,
            source: "addon",
            expiresAt: addonExpiryFromCode(addonPurchase.addon_code),
            metadata: { addon_name: addonPurchase.addon_name, payment_track_id: trackId },
          });
          await completeAddonPurchase(addonPurchase.id, entitlement.id);
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

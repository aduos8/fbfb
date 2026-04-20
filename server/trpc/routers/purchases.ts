import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createInvoice } from '../../lib/oxapay';
import {
  createPurchase,
  completePurchase,
  listUserPurchases,
  getPurchaseByTrackId,
  listAllPurchases,
} from '../../lib/db/purchases';
import {
  createPaymentSession,
  linkTrackIdToSession,
} from '../../lib/db/paymentSessions';
import {
  PLAN_CREDITS,
  PLAN_PRICES,
  getActiveSubscription,
  createSubscription,
  cancelSubscription,
  listUserSubscriptions,
} from '../../lib/db/subscriptions';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

const CREDIT_PACKAGES = [
  { credits: 5, price_cents: 500, label: '5 Credits' },
  { credits: 10, price_cents: 950, label: '10 Credits' },
  { credits: 25, price_cents: 2200, label: '25 Credits' },
  { credits: 50, price_cents: 4000, label: '50 Credits' },
  { credits: 100, price_cents: 7500, label: '100 Credits' },
];

export const purchasesRouter = t.router({
  getPackages: protectedProcedure.query(() => {
    return CREDIT_PACKAGES;
  }),

  createPurchase: protectedProcedure
    .input(
      z.object({
        credits: z.number().int().positive(),
        price_cents: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pkg = CREDIT_PACKAGES.find(
        (p) => p.credits === input.credits && p.price_cents === input.price_cents
      );
      if (!pkg) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid package' });
      }

      const shortId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const orderId = `p${shortId}`;
      const callbackUrl = `${process.env.PUBLIC_URL ?? 'http://localhost:8082'}/api/webhooks/oxapay`;

      let invoice;
      try {
        invoice = await createInvoice({
          amount: pkg.price_cents / 100,
          order_id: orderId,
          callback_url: callbackUrl,
          lifetime: 30,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'Failed to create payment. Please try again.',
        });
      }

      const session = await createPaymentSession(
        ctx.userId,
        'purchase',
        pkg.price_cents,
        pkg.credits,
        orderId
      );

      await linkTrackIdToSession(session.id, invoice.track_id, new Date(invoice.expired_at * 1000));

      const purchase = await createPurchase(
        ctx.userId,
        pkg.price_cents,
        pkg.credits,
        invoice.track_id
      );

      return {
        payment_url: invoice.payment_url,
        track_id: invoice.track_id,
        expires_at: invoice.expired_at,
        purchase_id: purchase.id,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const purchases = await listUserPurchases(ctx.userId, input.limit, input.offset);
      return {
        purchases: purchases.map((p) => ({
          id: p.id,
          amount_cents: p.amount_cents,
          credits_purchased: p.credits_purchased,
          status: p.status,
          created_at: p.created_at.toISOString(),
          completed_at: p.completed_at?.toISOString() ?? null,
        })),
      };
    }),

  getPlans: protectedProcedure.query(() => {
    return [
      {
        id: 'basic',
        name: 'Basic',
        price_cents: PLAN_PRICES.basic,
        credits_per_month: PLAN_CREDITS.basic,
        features: [
          'Email Search',
          'Phone Search',
          'Username Search',
          'No Captcha',
        ],
      },
      {
        id: 'intermediate',
        name: 'Intermediate',
        price_cents: PLAN_PRICES.intermediate,
        credits_per_month: PLAN_CREDITS.intermediate,
        features: [
          'Email Search',
          'Phone Search',
          'Username Search',
          'No Captcha',
          'API Access',
        ],
      },
      {
        id: 'advanced',
        name: 'Advanced',
        price_cents: PLAN_PRICES.advanced,
        credits_per_month: PLAN_CREDITS.advanced,
        features: [
          'Email Search',
          'Phone Search',
          'Username Search',
          'No Captcha',
          'API Access',
          'Dedicated Support',
        ],
      },
    ];
  }),

  createSubscription: protectedProcedure
    .input(
      z.object({
        plan_type: z.enum(['basic', 'intermediate', 'advanced']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const price = PLAN_PRICES[input.plan_type];
      const shortId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const orderId = `s${shortId}`;
      const callbackUrl = `${process.env.PUBLIC_URL ?? 'http://localhost:8082'}/api/webhooks/oxapay`;

      console.log('[createSubscription] Creating invoice:', {
        amount: price / 100,
        order_id: orderId,
        callback_url: callbackUrl,
      });

      let invoice;
      try {
        invoice = await createInvoice({
          amount: price / 100,
          order_id: orderId,
          callback_url: callbackUrl,
          lifetime: 30,
        });
        console.log('[createSubscription] Invoice created:', invoice);
      } catch (err: any) {
        console.error('[createSubscription] Oxapay error:', err.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'Failed to create payment. Please try again.',
        });
      }

      const session = await createPaymentSession(
        ctx.userId,
        'subscription',
        price,
        PLAN_CREDITS[input.plan_type],
        orderId
      );

      await linkTrackIdToSession(session.id, invoice.track_id, new Date(invoice.expired_at * 1000));

      return {
        payment_url: invoice.payment_url,
        track_id: invoice.track_id,
        expires_at: invoice.expired_at,
      };
    }),

  getActive: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getActiveSubscription(ctx.userId);
    return { subscriptions: sub ? [sub] : [] };
  }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const subs = await listUserSubscriptions(ctx.userId);
    return { subscriptions: subs };
  }),

  cancel: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await getActiveSubscription(ctx.userId);
      if (!sub || sub.id !== input.subscriptionId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }
      await cancelSubscription(input.subscriptionId);
      return { ok: true };
    }),

  getBillingHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const purchases = await listUserPurchases(ctx.userId, input.limit, 0);
      return {
        history: purchases.map((p) => ({
          id: p.id,
          plan_code: 'purchase',
          status: p.status,
          created_at: p.created_at.toISOString(),
        })),
      };
    }),
});

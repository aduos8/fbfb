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
  listActiveEntitlements,
  grantEntitlement,
} from '../../lib/db/entitlements';
import { sql } from "../../lib/db";
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

const ADDON_CATALOG = [
  { code: "data-unlock-profile", name: "Data Unlock: Profile Full Access", credit_cost: 25, entitlement_code: "data-unlock-profile", duration_days: null as number | null },
  { code: "data-unlock-messages", name: "Data Unlock: Message History Export", credit_cost: 40, entitlement_code: "data-unlock-messages", duration_days: null as number | null },
  { code: "analytics-crossref", name: "Analytics: Cross-Reference Analysis", credit_cost: 30, entitlement_code: "analytics-crossref", duration_days: 30 },
  { code: "analytics-heatmap", name: "Analytics: Activity Heatmap", credit_cost: 20, entitlement_code: "analytics-heatmap", duration_days: 30 },
  { code: "tracking-monitor", name: "Tracking: Profile Monitor Pack", credit_cost: 45, entitlement_code: "tracking-monitor", duration_days: 30 },
  { code: "export-csv", name: "Export: CSV Bulk Export", credit_cost: 15, entitlement_code: "export-csv", duration_days: 30 },
  { code: "premium-filters", name: "Premium: Advanced Search Filters", credit_cost: 15, entitlement_code: "premium-filters", duration_days: 30 },
  { code: "export-pdf", name: "Export: PDF Report", credit_cost: 35, entitlement_code: "export-pdf", duration_days: 30 },
] as const;

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

  getAddons: protectedProcedure.query(async ({ ctx }) => {
    const entitlements = await listActiveEntitlements(ctx.userId);
    const activeCodes = new Set(entitlements.map((entry) => entry.code));

    return ADDON_CATALOG.map((addon) => ({
      ...addon,
      active: activeCodes.has(addon.entitlement_code),
    }));
  }),

  createAddonPurchase: protectedProcedure
    .input(
      z.object({
        addon_code: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const addon = ADDON_CATALOG.find((entry) => entry.code === input.addon_code);
      if (!addon) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid add-on" });
      }

      const alreadyActive = (await listActiveEntitlements(ctx.userId)).some(
        (entry) => entry.code === addon.entitlement_code
      );
      if (alreadyActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add-on already unlocked" });
      }

      const expiresAt = addon.duration_days
        ? new Date(Date.now() + addon.duration_days * 24 * 60 * 60 * 1000)
        : null;

      await sql.begin(async (trx) => {
        const [updated] = await trx<{ balance: number }[]>`
          UPDATE credits
          SET balance = balance - ${addon.credit_cost}, updated_at = NOW()
          WHERE user_id = ${ctx.userId} AND balance >= ${addon.credit_cost}
          RETURNING balance
        `;

        if (!updated) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient credits for this add-on" });
        }

        await trx`
          INSERT INTO credit_transactions (user_id, amount, type, reference, notes)
          VALUES (
            ${ctx.userId},
            ${-addon.credit_cost},
            'addon_purchase',
            ${addon.code},
            ${JSON.stringify({ addon_name: addon.name, entitlement_code: addon.entitlement_code })}
          )
        `;
      });

      await grantEntitlement({
        userId: ctx.userId,
        code: addon.entitlement_code,
        source: "addon",
        expiresAt,
        metadata: { addon_name: addon.name },
      });

      return {
        ok: true,
        addon_code: addon.code,
        entitlement_code: addon.entitlement_code,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
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

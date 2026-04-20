import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createTracking,
  cancelTracking,
  pauseTracking,
  reactivateTracking,
  renewTracking,
  getActiveTrackings,
  getTrackingByProfile,
  getTrackingById,
} from '../../lib/db/tracking';
import { sql } from '../../lib/db';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

export const trackingRouter = t.router({
  startTracking: protectedProcedure
    .input(
      z.object({
        profileUserId: z.string().min(1).max(128),
        profileUsername: z.string().max(128).optional(),
        profileDisplayName: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [balanceRow] = await sql<{ balance: number }[]>`
        SELECT balance FROM credits WHERE user_id = ${ctx.userId}
      `;
      const balance = balanceRow?.balance ?? 0;

      if (balance < 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Insufficient credits',
        });
      }

      const existing = await getTrackingByProfile(ctx.userId, input.profileUserId);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already tracking this profile',
        });
      }

      await sql.begin(async (trx) => {
        const [deductResult] = await trx<{ balance: number }[]>`
          UPDATE credits SET balance = balance - 1, updated_at = NOW()
          WHERE user_id = ${ctx.userId} AND balance >= 1
          RETURNING balance
        `;
        if (!deductResult) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Insufficient credits' });
        }
        await trx`
          INSERT INTO credit_transactions (user_id, amount, type, notes)
          VALUES (${ctx.userId}, -1, 'tracking_start', ${`Profile: ${input.profileUserId}`})
        `;
      });

      const tracking = await createTracking(
        ctx.userId,
        input.profileUserId,
        input.profileUsername ?? null,
        input.profileDisplayName ?? null
      );

      return {
        tracking: {
          id: tracking.id,
          profile_user_id: tracking.profile_user_id,
          profile_username: tracking.profile_username,
          profile_display_name: tracking.profile_display_name,
          status: tracking.status,
          cost_per_month: tracking.cost_per_month,
          created_at: tracking.created_at.toISOString(),
          last_renewal_at: tracking.last_renewal_at.toISOString(),
        },
      };
    }),

  stopTracking: protectedProcedure
    .input(z.object({ trackingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tracking = await getTrackingById(input.trackingId);
      if (!tracking) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tracking not found' });
      }
      if (tracking.user_id !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await cancelTracking(input.trackingId);
      return { ok: true };
    }),

  renewTracking: protectedProcedure
    .input(z.object({ trackingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tracking = await getTrackingById(input.trackingId);
      if (!tracking) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tracking not found' });
      }
      if (tracking.user_id !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const [balanceRow] = await sql<{ balance: number }[]>`
        SELECT balance FROM credits WHERE user_id = ${ctx.userId}
      `;
      const balance = balanceRow?.balance ?? 0;

      if (balance < 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Insufficient credits',
        });
      }

      await sql.begin(async (trx) => {
        const [deductResult] = await trx<{ balance: number }[]>`
          UPDATE credits SET balance = balance - 1, updated_at = NOW()
          WHERE user_id = ${ctx.userId} AND balance >= 1
          RETURNING balance
        `;
        if (!deductResult) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Insufficient credits' });
        }
        await trx`
          INSERT INTO credit_transactions (user_id, amount, type, notes)
          VALUES (${ctx.userId}, -1, 'tracking_renewal', ${`Tracking: ${input.trackingId}`})
        `;
      });

      await renewTracking(input.trackingId);
      return { ok: true };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const trackings = await getActiveTrackings(ctx.userId);
    return {
      trackings: trackings.map((t) => ({
        id: t.id,
        profile_user_id: t.profile_user_id,
        profile_username: t.profile_username,
        profile_display_name: t.profile_display_name,
        status: t.status,
        cost_per_month: t.cost_per_month,
        created_at: t.created_at.toISOString(),
        last_renewal_at: t.last_renewal_at.toISOString(),
      })),
    };
  }),

  checkTracking: protectedProcedure
    .input(z.object({ profileUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const existing = await getTrackingByProfile(ctx.userId, input.profileUserId);
      if (!existing) return { isTracking: false, tracking: null };
      return {
        isTracking: true,
        tracking: {
          id: existing.id,
          profile_user_id: existing.profile_user_id,
          profile_username: existing.profile_username,
          profile_display_name: existing.profile_display_name,
          status: existing.status,
          cost_per_month: existing.cost_per_month,
          created_at: existing.created_at.toISOString(),
          last_renewal_at: existing.last_renewal_at.toISOString(),
        },
      };
    }),
});

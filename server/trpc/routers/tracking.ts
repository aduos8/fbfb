import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { TrackingEventSchema, TrackingRecordSchema } from '../../../shared/api';
import {
  cancelTracking,
  createTracking,
  getActiveTrackings,
  getNextRenewalAt,
  getPausedTrackings,
  getTrackingById,
  getTrackingByProfile,
  getTrackingEventsForUser,
  type TrackingRecord,
} from '../../lib/db/tracking';
import { loadObservedProfileForUser, chargeTrackingCredits } from '../../lib/trackingSupport';
import { loadSingleRedaction } from '../../lib/tg-queries/redactions';
import { getViewerAccess } from '../../lib/tg-queries/viewer';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

function serializeTrackingRecord(record: TrackingRecord, isRedacted: boolean = false) {
  return {
    id: record.id,
    profile_user_id: record.profile_user_id,
    profile_username: isRedacted ? null : record.profile_username,
    profile_display_name: isRedacted ? null : record.profile_display_name,
    status: record.status,
    cost_per_month: record.cost_per_month,
    created_at: record.created_at.toISOString(),
    last_renewal_at: record.last_renewal_at.toISOString(),
    next_renewal_at: getNextRenewalAt(record.last_renewal_at).toISOString(),
    last_detected_change_at: record.last_detected_change_at?.toISOString() ?? null,
  };
}

export const trackingRouter = t.router({
  startTracking: protectedProcedure
    .input(
      z.object({
        profileUserId: z.string().min(1).max(128),
        profileUsername: z.string().max(128).optional(),
        profileDisplayName: z.string().max(256).optional(),
      })
    )
    .output(z.object({ tracking: TrackingRecordSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getTrackingByProfile(ctx.userId, input.profileUserId);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already tracking this profile',
        });
      }

      const observed = await loadObservedProfileForUser(input.profileUserId);
      if (!observed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found',
        });
      }

      const charged = await chargeTrackingCredits({
        userId: ctx.userId,
        type: 'tracking_start',
        reference: `tracking:${input.profileUserId}`,
        notes: `Tracking start: ${input.profileUserId}`,
      });

      if (charged === null) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Insufficient credits',
        });
      }

      const tracking = await createTracking(
        ctx.userId,
        input.profileUserId,
        observed.profileUsername ?? input.profileUsername ?? null,
        observed.profileDisplayName ?? input.profileDisplayName ?? null,
        observed.observedProfile
      );

      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });
      const profileRedaction = await loadSingleRedaction("user", input.profileUserId);
      const isRedacted = profileRedaction?.type === "full" && !viewer.canBypassRedactions;

      return {
        tracking: serializeTrackingRecord(tracking, isRedacted),
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

  list: protectedProcedure
    .output(z.object({ trackings: z.array(TrackingRecordSchema) }))
    .query(async ({ ctx }) => {
      const trackings = await getActiveTrackings(ctx.userId);
      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });

      const result = await Promise.all(
        trackings.map(async (tracking) => {
          const profileRedaction = await loadSingleRedaction("user", tracking.profile_user_id);
          const isRedacted = profileRedaction?.type === "full" && !viewer.canBypassRedactions;
          return serializeTrackingRecord(tracking, isRedacted);
        })
      );

      return { trackings: result };
    }),

  getPausedTrackings: protectedProcedure
    .output(z.object({ trackings: z.array(TrackingRecordSchema) }))
    .query(async ({ ctx }) => {
      const trackings = await getPausedTrackings(ctx.userId);
      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });

      const result = await Promise.all(
        trackings.map(async (tracking) => {
          const profileRedaction = await loadSingleRedaction("user", tracking.profile_user_id);
          const isRedacted = profileRedaction?.type === "full" && !viewer.canBypassRedactions;
          return serializeTrackingRecord(tracking, isRedacted);
        })
      );

      return { trackings: result };
    }),

  history: protectedProcedure
    .input(z.object({
      trackingId: z.string().uuid().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .output(z.object({ events: z.array(TrackingEventSchema) }))
    .query(async ({ ctx, input }) => {
      if (input.trackingId) {
        const tracking = await getTrackingById(input.trackingId);
        if (!tracking || tracking.user_id !== ctx.userId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tracking not found' });
        }
      }

      const events = await getTrackingEventsForUser({
        userId: ctx.userId,
        trackingId: input.trackingId,
        limit: input.limit,
      });

      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });
      const profileIds = [...new Set(events.map((e) => e.profile_user_id))];
      const redactionMap = new Map<string, boolean>();

      await Promise.all(
        profileIds.map(async (profileId) => {
          const profileRedaction = await loadSingleRedaction("user", profileId);
          redactionMap.set(
            profileId,
            profileRedaction?.type === "full" && !viewer.canBypassRedactions
          );
        })
      );

      return {
        events: events.map((event) => ({
          id: event.id,
          tracking_id: event.tracking_id,
          profile_user_id: event.profile_user_id,
          profile_username: redactionMap.get(event.profile_user_id) ? null : event.profile_username,
          field_name: event.field_name,
          old_value: event.old_value,
          new_value: event.new_value,
          created_at: event.created_at.toISOString(),
        })),
      };
    }),

  checkTracking: protectedProcedure
    .input(z.object({ profileUserId: z.string() }))
    .output(z.object({
      isTracking: z.boolean(),
      tracking: TrackingRecordSchema.nullable(),
    }))
    .query(async ({ ctx, input }) => {
      const existing = await getTrackingByProfile(ctx.userId, input.profileUserId);
      if (!existing) {
        return { isTracking: false, tracking: null };
      }

      const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });
      const profileRedaction = await loadSingleRedaction("user", input.profileUserId);
      const isRedacted = profileRedaction?.type === "full" && !viewer.canBypassRedactions;

      return {
        isTracking: true,
        tracking: serializeTrackingRecord(existing, isRedacted),
      };
    }),
});

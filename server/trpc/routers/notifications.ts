import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createNotification,
  markNotificationRead,
  markAllRead,
  getUserNotifications,
  getUnreadCount,
  type NotificationType,
} from '../../lib/db/notifications';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

export const notificationsRouter = t.router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        unreadOnly: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const notifications = await getUserNotifications(ctx.userId, input.limit);
      const unread = await getUnreadCount(ctx.userId);

      let filteredNotifications = notifications;
      if (input.unreadOnly) {
        filteredNotifications = notifications.filter(n => !n.read);
      }

      return {
        notifications: filteredNotifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          read: n.read,
          created_at: n.created_at.toISOString(),
        })),
        unread,
        total: notifications.length,
      };
    }),

  getUnread: protectedProcedure.query(async ({ ctx }) => {
    const unread = await getUnreadCount(ctx.userId);
    return { unread };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(input.id);
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllRead(ctx.userId);
    return { ok: true };
  }),

  create: protectedProcedure
    .input(
      z.object({
        type: z.enum([
          'username_changed',
          'display_name_changed',
          'bio_updated',
          'profile_photo_changed',
          'phone_changed',
          'premium_status_changed',
          'credits_low',
          'tracking_renewal',
          'tracking_expired',
          'subscription_expired',
          'system',
        ] as const),
        title: z.string().min(1).max(256),
        body: z.string().max(1024).optional(),
        data: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const notification = await createNotification(
        ctx.userId,
        input.type as NotificationType,
        input.title,
        input.body ?? '',
        input.data ?? {}
      );
      return { id: notification.id };
    }),
});

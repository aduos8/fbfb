import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CANONICAL_REDACTION_FIELDS,
  getRedaction,
  listRedactionsByType,
  listRedactions,
  removeRedaction,
  upsertRedaction,
} from '../../lib/db/redactions';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

const redactionManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== 'owner' && ctx.userRole !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin or owner access required' });
  }
  return next({ ctx });
});

export const redactionsRouter = t.router({
  create: redactionManagerProcedure
    .input(
      z.object({
        targetType: z.enum(['user', 'channel', 'group']),
        targetId: z.string().min(1).max(128),
        redactionType: z.enum(['full', 'partial', 'masked']),
        redactedFields: z.array(z.string()).optional(),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fields =
        input.redactionType === 'full' || input.redactionType === 'masked'
          ? [...CANONICAL_REDACTION_FIELDS]
          : (input.redactedFields ?? []);

      const redaction = await upsertRedaction({
        targetType: input.targetType,
        targetId: input.targetId,
        redactionType: input.redactionType,
        redactedFields: fields,
        reason: input.reason,
        actorId: ctx.userId,
      });

      return {
        redaction: {
          id: redaction.id,
          target_type: redaction.target_type,
          target_id: redaction.target_id,
          redaction_type: redaction.redaction_type,
          redacted_fields: redaction.redacted_fields,
          reason: redaction.reason,
          created_at: redaction.created_at.toISOString(),
        },
      };
    }),

  list: redactionManagerProcedure
    .input(z.object({ targetType: z.enum(['user', 'channel', 'group']).optional() }).optional())
    .query(async ({ input }) => {
    const redactions = input?.targetType
      ? await listRedactionsByType(input.targetType)
      : await listRedactions();
    return {
      redactions: redactions.map((r) => ({
        id: r.id,
        target_type: r.target_type,
        target_id: r.target_id,
        redaction_type: r.redaction_type,
        redacted_fields: r.redacted_fields,
        reason: r.reason,
        created_by: r.created_by,
        created_at: r.created_at.toISOString(),
      })),
    };
  }),

  remove: redactionManagerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await removeRedaction(input.id, ctx.userId);
      return { ok: true };
    }),

  check: protectedProcedure
    .input(
      z.object({
        targetType: z.string(),
        targetId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const redaction = await getRedaction(input.targetType, input.targetId);
      if (!redaction) {
        return { redaction: null };
      }
      return {
        redaction: {
          target_type: redaction.target_type,
          target_id: redaction.target_id,
          redaction_type: redaction.redaction_type,
          redacted_fields: redaction.redacted_fields,
          reason: redaction.reason,
        },
      };
    }),
});

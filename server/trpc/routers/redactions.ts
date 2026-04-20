import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createRedaction,
  getRedaction,
  listRedactions,
  removeRedaction,
} from '../../lib/db/redactions';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
  }
  return next({ ctx });
});

export const redactionsRouter = t.router({
  create: ownerProcedure
    .input(
      z.object({
        targetType: z.enum(['user', 'channel', 'group']),
        targetId: z.string().min(1).max(128),
        redactionType: z.enum(['full', 'partial']),
        redactedFields: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fields =
        input.redactionType === 'full'
          ? ['username', 'display_name', 'bio', 'avatar_url']
          : (input.redactedFields ?? []);

      const redaction = await createRedaction(
        input.targetType,
        input.targetId,
        input.redactionType,
        fields,
        ctx.userId
      );

      return {
        redaction: {
          id: redaction.id,
          target_type: redaction.target_type,
          target_id: redaction.target_id,
          redaction_type: redaction.redaction_type,
          redacted_fields: redaction.redacted_fields,
          created_at: redaction.created_at.toISOString(),
        },
      };
    }),

  list: ownerProcedure.query(async () => {
    const redactions = await listRedactions();
    return {
      redactions: redactions.map((r) => ({
        id: r.id,
        target_type: r.target_type,
        target_id: r.target_id,
        redaction_type: r.redaction_type,
        redacted_fields: r.redacted_fields,
        created_by: r.created_by,
        created_at: r.created_at.toISOString(),
      })),
    };
  }),

  remove: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await removeRedaction(input.id);
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
        },
      };
    }),
});

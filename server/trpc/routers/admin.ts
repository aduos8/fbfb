import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "../../lib/db";
import {
  CANONICAL_REDACTION_FIELDS,
  listRedactionsByType,
  removeRedactionByTarget,
  upsertRedaction,
  deactivateRedaction,
  reactivateRedaction,
} from "../../lib/db/redactions";
import type { Context } from "../context";

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const adminRouter = t.router({
  users: t.router({
    list: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const { status, limit, offset } = input;

        if (status && status !== "all") {
          const users = await sql<{
            id: string;
            email: string;
            role: string;
            status: string;
            balance: number;
            created_at: Date;
          }[]>`
            SELECT u.id, u.email, u.role, u.status, u.created_at,
                   COALESCE(c.balance, 0) as balance
            FROM users u
            LEFT JOIN credits c ON c.user_id = u.id
            WHERE u.status = ${status}
            ORDER BY u.created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `;
          return { users };
        }

        const users = await sql<{
          id: string;
          email: string;
          role: string;
          status: string;
          balance: number;
          created_at: Date;
        }[]>`
          SELECT u.id, u.email, u.role, u.status, u.created_at,
                 COALESCE(c.balance, 0) as balance
          FROM users u
          LEFT JOIN credits c ON c.user_id = u.id
          ORDER BY u.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        return { users };
      }),

    search: adminProcedure
      .input(z.object({
        query: z.string(),
        limit: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const users = await sql<{
          id: string;
          email: string;
          role: string;
          status: string;
          balance: number;
          created_at: Date;
        }[]>`
          SELECT u.id, u.email, u.role, u.status, u.created_at,
                 COALESCE(c.balance, 0) as balance
          FROM users u
          LEFT JOIN credits c ON c.user_id = u.id
          WHERE u.email ILIKE ${"%" + input.query + "%"}
          ORDER BY u.created_at DESC
          LIMIT ${input.limit}
        `;
        return { users };
      }),

    getById: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const [user] = await sql<{
          id: string;
          email: string;
          role: string;
          status: string;
          balance: number;
          created_at: Date;
        }[]>`
          SELECT u.id, u.email, u.role, u.status, u.created_at,
                 COALESCE(c.balance, 0) as balance
          FROM users u
          LEFT JOIN credits c ON c.user_id = u.id
          WHERE u.id = ${input.id}
        `;
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        return { user, balance: user.balance };
      }),

    suspend: adminProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await sql`
          UPDATE users SET status = 'suspended', updated_at = NOW()
          WHERE id = ${input.id}
        `;
        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'user_suspend', 'user', ${input.id},
                  ${JSON.stringify({ reason: input.reason ?? null })}::jsonb)
        `;
        return { ok: true };
      }),

    unsuspend: adminProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await sql`
          UPDATE users SET status = 'active', updated_at = NOW()
          WHERE id = ${input.id}
        `;
        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'user_unsuspend', 'user', ${input.id},
                  ${JSON.stringify({ reason: input.reason ?? null })}::jsonb)
        `;
        return { ok: true };
      }),

    ban: adminProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await sql`
          UPDATE users SET status = 'banned', updated_at = NOW()
          WHERE id = ${input.id}
        `;
        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'user_ban', 'user', ${input.id},
                  ${JSON.stringify({ reason: input.reason })}::jsonb)
        `;
        return { ok: true };
      }),

    getUserPurchases: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        const purchases = await sql<{
          id: string;
          user_id: string;
          credits_purchased: number;
          status: string;
          created_at: Date;
        }[]>`
          SELECT id, user_id, credits_purchased, status, created_at
          FROM purchases
          WHERE user_id = ${input.userId}
          ORDER BY created_at DESC
          LIMIT 50
        `;
        return { purchases };
      }),

    getUserTransactions: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        const transactions = await sql<{
          id: string;
          user_id: string;
          amount: number;
          type: string;
          notes: string | null;
          created_at: Date;
        }[]>`
          SELECT id, user_id, amount, type, notes, created_at
          FROM credit_transactions
          WHERE user_id = ${input.userId}
          ORDER BY created_at DESC
          LIMIT 50
        `;
        return { transactions };
      }),

    changeRole: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        role: z.enum(["user", "admin", "owner"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.id === ctx.userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
        }
        await sql`
          UPDATE users SET role = ${input.role}, updated_at = NOW()
          WHERE id = ${input.id}
        `;
        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'user_role_change', 'user', ${input.id},
                  ${JSON.stringify({ role: input.role })}::jsonb)
        `;
        return { ok: true };
      }),
  }),

  credits: t.router({
    adjust: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        amount: z.number().int(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const [user] = await sql`SELECT id FROM users WHERE id = ${input.userId}`;
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

        await sql`
          UPDATE credits SET balance = balance + ${input.amount}, updated_at = NOW()
          WHERE user_id = ${input.userId}
        `;

        const type = input.amount > 0 ? "admin_credit" : "admin_debit";
        await sql`
          INSERT INTO credit_transactions (user_id, amount, type, notes)
          VALUES (${input.userId}, ${input.amount}, ${type}, ${input.reason ?? null})
        `;

        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'credit_adjustment', 'user', ${input.userId},
                  ${JSON.stringify({ amount: input.amount, reason: input.reason })}::jsonb)
        `;

        return { ok: true };
      }),

    setBalance: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        newBalance: z.number().int(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await sql<{ balance: number }[]>`
          SELECT balance FROM credits WHERE user_id = ${input.userId}
        `;
        const diff = input.newBalance - (current[0]?.balance ?? 0);

        await sql`
          UPDATE credits SET balance = ${input.newBalance}, updated_at = NOW()
          WHERE user_id = ${input.userId}
        `;

        if (diff !== 0) {
          const type = diff > 0 ? "admin_credit" : "admin_debit";
          await sql`
            INSERT INTO credit_transactions (user_id, amount, type, notes)
            VALUES (${input.userId}, ${diff}, ${type}, ${input.reason ?? null})
          `;
        }

        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'credit_set_balance', 'user', ${input.userId},
                  ${JSON.stringify({ newBalance: input.newBalance, reason: input.reason })}::jsonb)
        `;

        return { ok: true };
      }),

    getUserBalance: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        const [row] = await sql<{ balance: number }[]>`
          SELECT balance FROM credits WHERE user_id = ${input.userId}
        `;
        return { balance: row?.balance ?? 0 };
      }),
  }),

  vouchers: t.router({
    create: adminProcedure
      .input(z.object({
        code: z.string().min(4).max(32).regex(/^[A-Z0-9]+$/, "Code must be uppercase alphanumeric"),
        amount: z.number().int().positive().max(100000),
        maxRedemptions: z.number().int().positive().optional(),
        expiresAt: z.string().datetime().optional(),
        singleUse: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const [existing] = await sql`SELECT id FROM vouchers WHERE code = ${input.code}`;
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Voucher code already exists" });
        }

        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
        const [voucher] = await sql<{ id: string; code: string; credits: number }[]>`
          INSERT INTO vouchers (code, credits, max_uses, expires_at)
          VALUES (${input.code}, ${input.amount}, ${input.maxRedemptions ?? null}, ${expiresAt ?? null})
          RETURNING id, code, credits
        `;

        return { id: voucher.id, code: voucher.code, credits: voucher.credits };
      }),

    list: adminProcedure
      .input(z.object({
        activeOnly: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        let vouchers;
        if (input.activeOnly) {
          vouchers = await sql<{
            id: string;
            code: string;
            credits: number;
            max_uses: number | null;
            current_uses: number;
            expires_at: Date | null;
            active: boolean;
            created_at: Date;
          }[]>`
            SELECT id, code, credits, max_uses, current_uses, expires_at, active, created_at
            FROM vouchers WHERE active = true
            ORDER BY created_at DESC
            LIMIT ${input.limit}
            OFFSET ${input.offset}
          `;
        } else {
          vouchers = await sql<{
            id: string;
            code: string;
            credits: number;
            max_uses: number | null;
            current_uses: number;
            expires_at: Date | null;
            active: boolean;
            created_at: Date;
          }[]>`
            SELECT id, code, credits, max_uses, current_uses, expires_at, active, created_at
            FROM vouchers
            ORDER BY created_at DESC
            LIMIT ${input.limit}
            OFFSET ${input.offset}
          `;
        }

        return {
          vouchers: vouchers.map((v) => ({
            id: v.id,
            code: v.code,
            amount: v.credits,
            max_redemptions: v.max_uses,
            redemption_count: v.current_uses,
            expires_at: v.expires_at?.toISOString() ?? null,
            active: v.active,
            created_at: v.created_at.toISOString(),
          })),
        };
      }),

    disable: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await sql`UPDATE vouchers SET active = false WHERE id = ${input.id}`;
        return { ok: true };
      }),

    listRedemptions: adminProcedure
      .input(z.object({ voucherId: z.string().uuid().optional() }))
      .query(async ({ input }) => {
        let redemptions;
        if (input.voucherId) {
          redemptions = await sql<{
            id: string;
            voucher_id: string;
            user_id: string;
            redeemed_at: Date;
          }[]>`
            SELECT vr.id, vr.voucher_id, vr.user_id, vr.redeemed_at, u.email
            FROM voucher_redemptions vr
            JOIN users u ON u.id = vr.user_id
            WHERE vr.voucher_id = ${input.voucherId}
            ORDER BY vr.redeemed_at DESC
          `;
        } else {
          redemptions = await sql<{
            id: string;
            voucher_id: string;
            user_id: string;
            redeemed_at: Date;
          }[]>`
            SELECT vr.id, vr.voucher_id, vr.user_id, vr.redeemed_at, u.email
            FROM voucher_redemptions vr
            JOIN users u ON u.id = vr.user_id
            ORDER BY vr.redeemed_at DESC
            LIMIT 100
          `;
        }

        return {
          redemptions: redemptions.map((r: any) => ({
            id: r.id,
            voucher_id: r.voucher_id,
            user_id: r.user_id,
            email: r.email,
            created_at: r.redeemed_at.toISOString(),
          })),
        };
      }),
  }),

  purchases: t.router({
    list: adminProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ input }) => {
        let purchases;
        if (input.status) {
          purchases = await sql<{
            id: string;
            user_id: string;
            credits_purchased: number;
            status: string;
            created_at: Date;
            completed_at: Date | null;
          }[]>`
            SELECT id, user_id, credits_purchased, status, created_at, completed_at
            FROM purchases
            WHERE status = ${input.status}
            ORDER BY created_at DESC
            LIMIT 100
          `;
        } else {
          purchases = await sql<{
            id: string;
            user_id: string;
            credits_purchased: number;
            status: string;
            created_at: Date;
            completed_at: Date | null;
          }[]>`
            SELECT id, user_id, credits_purchased, status, created_at, completed_at
            FROM purchases
            ORDER BY created_at DESC
            LIMIT 100
          `;
        }

        return {
          purchases: purchases.map((p) => ({
            id: p.id,
            user_id: p.user_id,
            item_name: `${p.credits_purchased} credits`,
            credit_cost: p.credits_purchased,
            status: p.status,
            purchased_at: p.created_at.toISOString(),
            completed_at: p.completed_at?.toISOString() ?? null,
          })),
        };
      }),

    refund: adminProcedure
      .input(z.object({ purchaseId: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const [purchase] = await sql<{ user_id: string; credits_purchased: number }[]>`
          SELECT user_id, credits_purchased FROM purchases WHERE id = ${input.purchaseId}
        `;
        if (!purchase) throw new TRPCError({ code: "NOT_FOUND" });

        await sql`
          UPDATE purchases SET status = 'refunded' WHERE id = ${input.purchaseId}
        `;

        await sql`
          UPDATE credits SET balance = balance - ${purchase.credits_purchased}, updated_at = NOW()
          WHERE user_id = ${purchase.user_id}
        `;

        await sql`
          INSERT INTO credit_transactions (user_id, amount, type, notes)
          VALUES (${purchase.user_id}, ${-purchase.credits_purchased}, 'refund', ${input.reason ?? 'Admin refund'})
        `;

        await sql`
          INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
          VALUES (${ctx.userId}, 'purchase_refund', 'purchase', ${input.purchaseId},
                  ${JSON.stringify({ reason: input.reason })}::jsonb)
        `;

        return { ok: true };
      }),
  }),

  auditLogs: t.router({
    list: adminProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const logs = await sql<{
          id: string;
          admin_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          after_value: Record<string, unknown> | null;
          created_at: Date;
        }[]>`
          SELECT * FROM audit_logs
          ORDER BY created_at DESC
          LIMIT ${input.limit}
          OFFSET ${input.offset}
        `;

        return {
          logs: logs.map((l) => ({
            id: l.id,
            admin_id: l.admin_id,
            action: l.action,
            target_type: l.target_type,
            target_id: l.target_id,
            metadata: typeof l.after_value === 'string' ? JSON.parse(l.after_value) : l.after_value,
            created_at: l.created_at.toISOString(),
          })),
        };
      }),

    search: adminProcedure
      .input(z.object({
        action: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        let logs;

        if (input.startDate && input.endDate) {
          logs = await sql<{
            id: string;
            admin_id: string | null;
            action: string;
            target_type: string | null;
            target_id: string | null;
            after_value: Record<string, unknown> | null;
            created_at: Date;
          }[]>`
            SELECT * FROM audit_logs
            WHERE action = ${input.action ?? undefined}
              AND created_at >= ${new Date(input.startDate)}
              AND created_at <= ${new Date(input.endDate)}
            ORDER BY created_at DESC
            LIMIT ${input.limit}
          `;
        } else if (input.action) {
          logs = await sql<{
            id: string;
            admin_id: string | null;
            action: string;
            target_type: string | null;
            target_id: string | null;
            after_value: Record<string, unknown> | null;
            created_at: Date;
          }[]>`
            SELECT * FROM audit_logs
            WHERE action = ${input.action}
            ORDER BY created_at DESC
            LIMIT ${input.limit}
          `;
        } else {
          logs = await sql<{
            id: string;
            admin_id: string | null;
            action: string;
            target_type: string | null;
            target_id: string | null;
            after_value: Record<string, unknown> | null;
            created_at: Date;
          }[]>`
            SELECT * FROM audit_logs
            ORDER BY created_at DESC
            LIMIT ${input.limit}
          `;
        }

        return {
          logs: logs.map((l) => ({
            id: l.id,
            admin_id: l.admin_id,
            action: l.action,
            target_type: l.target_type,
            target_id: l.target_id,
            metadata: typeof l.after_value === 'string' ? JSON.parse(l.after_value) : l.after_value,
            created_at: l.created_at.toISOString(),
          })),
        };
      }),
  }),

  redactions: t.router({
    list: adminProcedure
      .input(z.object({ entityType: z.enum(["user", "channel", "group"]).optional() }))
      .query(async ({ input }) => {
        const redactions = await listRedactionsByType(input?.entityType);

        return {
          redactions: redactions.map((r) => ({
            id: r.id,
            entity_type: r.target_type,
            entity_id: r.target_id,
            redaction_type: r.redaction_type,
            fields: r.redacted_fields,
            reason: r.reason,
            created_at: r.created_at.toISOString(),
            is_active: r.is_active ?? true,
          })),
        };
      }),

    fullRedact: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertRedaction({
          targetType: input.entityType,
          targetId: input.entityId,
          redactionType: "full",
          redactedFields: [...CANONICAL_REDACTION_FIELDS],
          reason: input.reason,
          actorId: ctx.userId,
        });

        return { ok: true };
      }),

    maskedRedact: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertRedaction({
          targetType: input.entityType,
          targetId: input.entityId,
          redactionType: "masked",
          redactedFields: [...CANONICAL_REDACTION_FIELDS],
          reason: input.reason,
          actorId: ctx.userId,
        });

        return { ok: true };
      }),

    partialRedact: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
        fields: z.array(z.string()),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertRedaction({
          targetType: input.entityType,
          targetId: input.entityId,
          redactionType: "partial",
          redactedFields: input.fields,
          reason: input.reason,
          actorId: ctx.userId,
        });

        return { ok: true };
      }),

    remove: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await removeRedactionByTarget({
          targetType: input.entityType,
          targetId: input.entityId,
          actorId: ctx.userId,
        });

        return { ok: true };
      }),

    deactivate: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await deactivateRedaction(input.entityType, input.entityId, ctx.userId);
        return { ok: true };
      }),

    reactivate: adminProcedure
      .input(z.object({
        entityType: z.enum(["user", "channel", "group"]),
        entityId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await reactivateRedaction(input.entityType, input.entityId, ctx.userId);
        return { ok: true };
      }),
  }),
});

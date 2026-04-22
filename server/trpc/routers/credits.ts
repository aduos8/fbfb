import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "../../lib/db";
import type { Context } from "../context";

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

const DEFAULT_CREDIT_LIMIT = 5000;

export const creditsRouter = t.router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await sql<{ balance: number }[]>`
      SELECT balance FROM credits WHERE user_id = ${ctx.userId}
    `;
    const [searchesRow] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count
      FROM credit_transactions
      WHERE user_id = ${ctx.userId}
        AND type = 'credit_deducted'
        AND reference LIKE 'search:%'
    `;
    return {
      balance: Number(row?.balance ?? 0),
      credit_limit: DEFAULT_CREDIT_LIMIT,
      total_searches: parseInt(searchesRow?.count ?? "0", 10),
    };
  }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const [totalRow] = await sql<{ total: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total
      FROM credit_transactions WHERE user_id = ${ctx.userId}
    `;
    const [txnCount] = await sql<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = ${ctx.userId}
    `;
    return {
      total_credits_earned: Number(totalRow?.total ?? 0),
      total_transactions: Number(txnCount?.count ?? 0),
    };
  }),

  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const transactions = await sql<{
        id: string;
        amount: number;
        type: string;
        reference: string | null;
        notes: string | null;
        created_at: Date;
      }[]>`
        SELECT * FROM credit_transactions
        WHERE user_id = ${ctx.userId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `;
      return {
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          transaction_type: t.type,
          reference: t.reference,
          notes: t.notes,
          created_at: t.created_at.toISOString(),
        })),
      };
    }),

  listTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const transactions = await sql<{
        id: string;
        amount: number;
        type: string;
        reference: string | null;
        notes: string | null;
        created_at: Date;
      }[]>`
        SELECT * FROM credit_transactions
        WHERE user_id = ${ctx.userId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
        OFFSET ${input.offset}
      `;

      const [totalRow] = await sql<{ count: string }[]>`
        SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = ${ctx.userId}
      `;

      return {
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          transaction_type: t.type,
          reference: t.reference,
          notes: t.notes,
          created_at: t.created_at.toISOString(),
        })),
        total: parseInt(totalRow?.count ?? "0", 10),
      };
    }),

  redeemVoucher: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const code = input.code.toUpperCase().trim();
      const updatedBalance = await sql.begin(async (trx) => {
        const [voucher] = await trx<{
          id: string;
          credits: number;
          max_uses: number | null;
          current_uses: number;
          expires_at: Date | null;
          active: boolean;
        }[]>`
          SELECT id, credits, max_uses, current_uses, expires_at, active
          FROM vouchers
          WHERE code = ${code}
          FOR UPDATE
        `;

        if (!voucher) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid voucher code" });
        }

        if (!voucher.active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher is no longer active" });
        }

        if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher has expired" });
        }

        if (voucher.max_uses !== null && voucher.current_uses >= voucher.max_uses) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher has reached its usage limit" });
        }

        const [redemption] = await trx<{ id: string }[]>`
          INSERT INTO voucher_redemptions (voucher_id, user_id)
          VALUES (${voucher.id}, ${ctx.userId})
          ON CONFLICT (voucher_id, user_id) DO NOTHING
          RETURNING id
        `;

        if (!redemption) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You already redeemed this voucher code" });
        }

        const [usageUpdated] = await trx<{ id: string }[]>`
          UPDATE vouchers
          SET current_uses = current_uses + 1
          WHERE id = ${voucher.id}
            AND (max_uses IS NULL OR current_uses < max_uses)
          RETURNING id
        `;

        if (!usageUpdated) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher has reached its usage limit" });
        }

        await trx`
          UPDATE credits SET balance = balance + ${voucher.credits}, updated_at = NOW()
          WHERE user_id = ${ctx.userId}
        `;

        await trx`
          INSERT INTO credit_transactions (user_id, amount, type, reference)
          VALUES (${ctx.userId}, ${voucher.credits}, 'voucher_redemption', ${code})
        `;

        const [balanceRow] = await trx<{ balance: number }[]>`
          SELECT balance FROM credits WHERE user_id = ${ctx.userId}
        `;

        return {
          creditsAdded: voucher.credits,
          newBalance: balanceRow?.balance ?? 0,
        };
      });

      return {
        creditsAdded: updatedBalance.creditsAdded,
        newBalance: updatedBalance.newBalance,
      };
    }),
});

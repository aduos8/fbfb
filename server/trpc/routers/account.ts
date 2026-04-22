import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db";
import { listActiveEntitlements } from "../../lib/db/entitlements";
import { appendSetCookie, clearAuthStateCookie, getTokenCookieOptions, type Context } from "../context";

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

export const accountRouter = t.router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await sql<{
      id: string;
      username: string;
      email: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT id, username, email, status, created_at FROM users WHERE id = ${ctx.userId}
    `;
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      profile: {
        email: user.email,
        username: user.username,
        created_at: user.created_at.toISOString(),
        status: user.status,
      },
    };
  }),

  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await sql<{ balance: number }[]>`
      SELECT balance FROM credits WHERE user_id = ${ctx.userId}
    `;
    return { credits: row?.balance ?? 0 };
  }),

  getEntitlements: protectedProcedure.query(async ({ ctx }) => {
    const entitlements = await listActiveEntitlements(ctx.userId);
    return {
      entitlements: entitlements.map((entry) => ({
        id: entry.id,
        code: entry.code,
        source: entry.source,
        granted_at: entry.granted_at.toISOString(),
        expires_at: entry.expires_at ? entry.expires_at.toISOString() : null,
      })),
    };
  }),

  updateProfile: protectedProcedure
    .input(z.object({ displayName: z.string().min(1).max(50).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.displayName !== undefined) {
        const displayName = input.displayName.trim();
        if (displayName.length > 0) {
          await sql`
            UPDATE users SET username = ${displayName}, updated_at = NOW() WHERE id = ${ctx.userId}
          `;
        }
      }
      return { ok: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM users WHERE id = ${ctx.userId}
      `;
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const valid = await bcrypt.compare(input.currentPassword, user.password_hash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }

      const hash = await bcrypt.hash(input.newPassword, 12);
      await sql`
        UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${ctx.userId}
      `;

      return { ok: true };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM users WHERE id = ${ctx.userId}
      `;
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const valid = await bcrypt.compare(input.password, user.password_hash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
      }

      await sql`DELETE FROM sessions WHERE user_id = ${ctx.userId}`;
      await sql`DELETE FROM users WHERE id = ${ctx.userId}`;
      appendSetCookie(ctx.res, getTokenCookieOptions());
      appendSetCookie(ctx.res, clearAuthStateCookie());

      return { ok: true };
    }),
});

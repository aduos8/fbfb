import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db";
import {
  appendSetCookie,
  clearAuthStateCookie,
  createAuthStateCookie,
  createTokenCookie,
  getTokenCookieOptions,
  type Context,
} from "../context";

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, userRole: ctx.userRole } });
});

function generateToken(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const authRouter = t.router({
  register: publicProcedure
    .input(z.object({
      username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
      email: z.string().email(),
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const { username, email, password } = input;

      const [existingEmail] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${email.toLowerCase()}
      `;
      if (existingEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      const [existingUsername] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE username = ${username.toLowerCase()}
      `;
      if (existingUsername) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [user] = await sql<{ id: string; email: string; username: string }[]>`
        INSERT INTO users (username, email, password_hash)
        VALUES (${username.toLowerCase()}, ${email.toLowerCase()}, ${passwordHash})
        RETURNING id, email, username
      `;

      await sql`
        INSERT INTO credits (user_id, balance) VALUES (${user.id}, 0)
      `;

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await sql`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
      `;

      await sql`
        UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}
      `;

      appendSetCookie(ctx.res, createTokenCookie(token));
      appendSetCookie(ctx.res, createAuthStateCookie());

      return {
        ok: true,
        user: {
          email: user.email,
          role: "customer",
        },
      };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { email, password } = input;

      const [user] = await sql<{
        id: string;
        email: string;
        password_hash: string;
        status: string;
        role: string;
        two_fa_enabled: boolean;
      }[]>`
        SELECT id, email, password_hash, status, role, two_fa_enabled
        FROM users WHERE email = ${email.toLowerCase()}
      `;

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (user.two_fa_enabled) {
        return { status: "2fa_required", userId: user.id };
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await sql`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
      `;

      await sql`
        UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}
      `;

      appendSetCookie(ctx.res, createTokenCookie(token));
      appendSetCookie(ctx.res, createAuthStateCookie());

      return { ok: true, user: { email: user.email, role: user.role } };
    }),

  verify2FA: publicProcedure
    .input(z.object({ userId: z.string(), code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, code } = input;

      const [user] = await sql<{
        id: string;
        email: string;
        role: string;
        two_fa_secret: string;
        status: string;
      }[]>`
        SELECT id, email, role, two_fa_secret, status FROM users WHERE id = ${userId}
      `;

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid session" });
      }

      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }

      if (!user.two_fa_secret) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "2FA not configured" });
      }

      const speakeasy = await import("speakeasy");
      const verified = speakeasy.verifyTotp({
        secret: user.two_fa_secret,
        encoding: "base32",
        token: code,
        window: 1,
      });

      if (!verified) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid 2FA code" });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await sql`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
      `;

      await sql`
        UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}
      `;

      appendSetCookie(ctx.res, createTokenCookie(token));
      appendSetCookie(ctx.res, createAuthStateCookie());

      return { ok: true, user: { email: user.email, role: user.role } };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await sql`
      DELETE FROM sessions WHERE user_id = ${ctx.userId}
    `;
    appendSetCookie(ctx.res, getTokenCookieOptions());
    appendSetCookie(ctx.res, clearAuthStateCookie());
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await sql<{
      id: string;
      username: string;
      email: string;
      role: string;
      status: string;
      email_verified: boolean;
      two_fa_enabled: boolean;
      created_at: Date;
      last_login_at: Date | null;
    }[]>`
      SELECT id, username, email, role, status, email_verified, two_fa_enabled, created_at, last_login_at
      FROM users WHERE id = ${ctx.userId}
    `;
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const [creditsRow] = await sql<{ balance: number }[]>`
      SELECT balance FROM credits WHERE user_id = ${ctx.userId}
    `;

    return { ...user, balance: creditsRow?.balance ?? 0 };
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

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async () => {
      return { ok: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const [record] = await sql<{ user_id: string }[]>`
        SELECT user_id FROM password_reset_tokens
        WHERE token = ${input.token}
          AND expires_at > NOW()
          AND used = FALSE
      `;
      if (!record) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
      }

      const hash = await bcrypt.hash(input.newPassword, 12);
      await sql`
        UPDATE users SET password_hash = ${hash}, updated_at = NOW()
        WHERE id = ${record.user_id}
      `;
      await sql`
        DELETE FROM sessions WHERE user_id = ${record.user_id}
      `;
      await sql`
        UPDATE password_reset_tokens SET used = TRUE
        WHERE token = ${input.token}
      `;

      return { ok: true };
    }),

  get2FAStatus: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await sql<{ two_fa_enabled: boolean }[]>`
      SELECT two_fa_enabled FROM users WHERE id = ${ctx.userId}
    `;
    return { enabled: user?.two_fa_enabled ?? false };
  }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await sql<{
      id: string;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
      expires_at: Date;
    }[]>`
      SELECT id, ip_address, user_agent, created_at, expires_at
      FROM sessions
      WHERE user_id = ${ctx.userId}
      ORDER BY created_at DESC
    `;
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        device: s.user_agent || "Unknown device",
        current: false,
        created_at: s.created_at.toISOString(),
      })),
    };
  }),

  setup2FA: protectedProcedure.mutation(async ({ ctx }) => {
    const speakeasy = await import("speakeasy");
    const secret = speakeasy.generateSecret({
      name: `FusionApp (${ctx.userId})`,
      length: 20,
    });

    await sql`
      UPDATE users SET two_fa_secret = ${secret.base32}, updated_at = NOW()
      WHERE id = ${ctx.userId}
    `;

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url || "",
    };
  }),

  confirm2FA: protectedProcedure
    .input(z.object({ secret: z.string(), code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const speakeasy = await import("speakeasy");
      const verified = speakeasy.verifyTotp({
        secret: input.secret,
        encoding: "base32",
        token: input.code,
        window: 1,
      });

      if (!verified) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid verification code" });
      }

      await sql`
        UPDATE users SET two_fa_enabled = TRUE, updated_at = NOW()
        WHERE id = ${ctx.userId}
      `;

      const backupCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        backupCodes.push(code);
      }

      return { backupCodes };
    }),

  disable2FA: protectedProcedure
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

      await sql`
        UPDATE users SET two_fa_enabled = FALSE, two_fa_secret = NULL, updated_at = NOW()
        WHERE id = ${ctx.userId}
      `;

      return { ok: true };
    }),

  revokeOtherSessions: protectedProcedure
    .input(z.object({ currentToken: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await sql`
        DELETE FROM sessions WHERE user_id = ${ctx.userId}
      `;

      if (input.currentToken) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`
          INSERT INTO sessions (user_id, token, expires_at)
          VALUES (${ctx.userId}, ${input.currentToken}, ${expiresAt})
        `;
      }

      return { revokedCount: 0 };
    }),
});

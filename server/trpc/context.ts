import type { IncomingMessage, ServerResponse } from "http";
import { sql } from "../lib/db";

export interface Context {
  userId: string | null;
  userRole: string | null;
  res?: ServerResponse;
  auth?: {
    userId?: string;
    role?: "user" | "admin" | "owner";
  };
}

const TOKEN_COOKIE_NAME = "auth_token";
const AUTH_STATE_COOKIE_NAME = "auth_state";
const TOKEN_HEADER_NAME = "authorization";
const TOKEN_PREFIX = "Bearer ";

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...valueParts] = cookie.split("=");
    if (name && valueParts.length > 0) {
      cookies[name.trim()] = decodeURIComponent(valueParts.join("=").trim());
    }
  });

  return cookies;
}

function extractToken(opts: { req: IncomingMessage }): string | null {
  const authHeader = opts.req.headers[TOKEN_HEADER_NAME];
  if (typeof authHeader === "string" && authHeader.startsWith(TOKEN_PREFIX)) {
    return authHeader.slice(TOKEN_PREFIX.length);
  }

  const cookies = parseCookies(opts.req.headers.cookie);
  const cookieToken = cookies[TOKEN_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export async function createContext(opts: { req: IncomingMessage; res?: ServerResponse }): Promise<Context> {
  const token = extractToken(opts);

  if (!token) {
    return { userId: null, userRole: null, res: opts.res };
  }

  if (!isValidTokenFormat(token)) {
    return { userId: null, userRole: null, res: opts.res };
  }

  const rows = await sql<{ user_id: string; role: string }[]>`
    SELECT u.id as user_id, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
      AND s.expires_at > NOW()
      AND u.status = 'active'
  `;

  if (Array.isArray(rows) ? rows.length === 0 : !rows) {
    return { userId: null, userRole: null, res: opts.res };
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    userId: row.user_id,
    userRole: row.role,
    res: opts.res,
    auth: {
      userId: row.user_id,
      role: row.role as "user" | "admin" | "owner",
    },
  };
}

function isValidTokenFormat(token: string): boolean {
  if (token.length < 32 || token.length > 512) {
    return false;
  }

  if (!/^[a-f0-9]+$/i.test(token)) {
    return false;
  }

  return true;
}

export function getTokenCookieOptions(maxAge: number = 7 * 24 * 60 * 60 * 1000): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "; SameSite=Strict" : "; SameSite=Lax";
  return `auth_token=; HttpOnly; Path=/; Max-Age=0${secure}${sameSite}`;
}

export function createTokenCookie(token: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "; SameSite=Strict" : "; SameSite=Lax";
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}${sameSite}`;
}

export function clearAuthStateCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "; SameSite=Strict" : "; SameSite=Lax";
  return `${AUTH_STATE_COOKIE_NAME}=0; Path=/; Max-Age=0${secure}${sameSite}`;
}

export function createAuthStateCookie(maxAge: number = 7 * 24 * 60 * 60 * 1000): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = process.env.NODE_ENV === "production" ? "; SameSite=Strict" : "; SameSite=Lax";
  return `${AUTH_STATE_COOKIE_NAME}=1; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}${sameSite}`;
}

export function appendSetCookie(res: ServerResponse | undefined, cookie: string): void {
  if (!res) return;

  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", [cookie]);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }

  res.setHeader("Set-Cookie", [String(existing), cookie]);
}

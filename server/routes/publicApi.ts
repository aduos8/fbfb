import type { Request, Response } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { resolveUserApiAccess } from "../lib/db/apiAccess";
import { authenticateApiKey } from "../lib/db/apiKeys";
import { sql } from "../lib/db";
import { deductSearchCredit, ensureSearchCredits, getViewerAccess } from "../lib/tg-queries/viewer";
import { runUnifiedSearch } from "../lib/tg-queries/searchService";
import { unifiedSearchSchema } from "../lib/tg-queries/searchSchemas";

type PublicApiRateLimitEntry = {
  count: number;
  resetAt: number;
};

const publicApiRateLimits = new Map<string, PublicApiRateLimitEntry>();
const PUBLIC_API_RATE_LIMIT_WINDOW_MS = 60_000;
const PUBLIC_API_RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT_MAX ?? 20);

function extractApiKey(req: Request) {
  const headerKey = req.header("x-api-key");
  if (headerKey) {
    return headerKey.trim();
  }

  const auth = req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }

  return null;
}

function sendError(res: Response, status: number, code: string, error: string, extra?: Record<string, unknown>) {
  res.status(status).json({ error, code, ...extra });
}

function publicApiRateLimitKey(req: Request, rawKey: string | null) {
  return rawKey
    ? `key:${createHash("sha256").update(rawKey).digest("hex")}`
    : `ip:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
}

function checkPublicApiRateLimit(req: Request, res: Response, rawKey: string | null) {
  const now = Date.now();
  const key = publicApiRateLimitKey(req, rawKey);
  const entry = publicApiRateLimits.get(key);

  if (!entry || entry.resetAt <= now) {
    publicApiRateLimits.set(key, { count: 1, resetAt: now + PUBLIC_API_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= PUBLIC_API_RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    sendError(res, 429, "rate_limited", `Rate limit exceeded. Try again in ${retryAfter} seconds.`, { retryAfter });
    return false;
  }

  entry.count += 1;
  return true;
}

function normalizePublicApiSearchBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const input = body as Record<string, unknown>;
  return {
    ...input,
    query: typeof input.query === "string" ? input.query : input.q,
  };
}

async function requireEnterpriseApiKey(req: Request, res: Response) {
  const rawKey = extractApiKey(req);
  if (!checkPublicApiRateLimit(req, res, rawKey)) {
    return null;
  }

  if (!rawKey) {
    sendError(res, 401, "api_key_required", "API key required");
    return null;
  }

  const apiKey = await authenticateApiKey(rawKey);
  if (!apiKey) {
    sendError(res, 401, "invalid_api_key", "Invalid API key");
    return null;
  }

  if (apiKey.role !== "admin" && apiKey.role !== "owner") {
    const access = await resolveUserApiAccess(apiKey.user_id);
    if (!access.allowed) {
      sendError(res, 403, "api_access_denied", access.reason);
      return null;
    }
  }

  return apiKey;
}

export async function handlePublicApiSearch(req: Request, res: Response) {
  try {
    const apiKey = await requireEnterpriseApiKey(req, res);
    if (!apiKey) return;

    const input = unifiedSearchSchema.parse(normalizePublicApiSearchBody(req.body));
    const viewer = await getViewerAccess({ userId: apiKey.user_id, role: apiKey.role });
    const creditsRemaining = input.page > 1
      ? await ensureSearchCredits(apiKey.user_id)
      : await deductSearchCredit(apiKey.user_id, `api:${input.type}`, input.query?.slice(0, 200) ?? "");
    const result = await runUnifiedSearch(input, { viewer });

    res.json({
      ...result,
      creditsRemaining,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "invalid_search_request", "Invalid search request", { issues: error.issues });
      return;
    }

    const message = error instanceof Error ? error.message : "Search failed";
    const status = message === "Insufficient credits" ? 402 : 500;
    sendError(res, status, status === 402 ? "insufficient_credits" : "search_failed", message);
  }
}

export async function handlePublicApiCredits(req: Request, res: Response) {
  try {
    const apiKey = await requireEnterpriseApiKey(req, res);
    if (!apiKey) return;

    const [row] = await sql<{ balance: number }[]>`
      SELECT balance FROM credits WHERE user_id = ${apiKey.user_id}
    `;
    res.json({
      balance: Number(row?.balance ?? 0),
      userId: apiKey.user_id,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credit lookup failed";
    sendError(res, 500, "server_error", message);
  }
}

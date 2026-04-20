import { TRPCError } from "@trpc/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 60;

export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now > entry.resetAt) {
      requestCounts.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60000);

export interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
}

export function createRateLimiter(config: RateLimitConfig = {}) {
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = config.maxRequests ?? DEFAULT_MAX_REQUESTS;

  return function rateLimit(identifier: string): void {
    const now = Date.now();
    const entry = requestCounts.get(identifier);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(identifier, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfterMs = entry.resetAt - now;
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Please try again in ${retryAfterSec} seconds.`,
      });
    }

    entry.count++;
  };
}

export const rateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

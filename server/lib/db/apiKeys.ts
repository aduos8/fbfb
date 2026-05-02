import { createHash, randomBytes } from "crypto";
import { sql } from "../db";
import { MemoryTtlCache } from "../memoryCache";

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  role: string;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export const MAX_ACTIVE_API_KEYS_PER_USER = 5;
const lastUsedWriteCache = new MemoryTtlCache<boolean>(10_000);
const LAST_USED_WRITE_TTL_MS = 60_000;

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function keyPrefix(key: string) {
  return key.slice(0, 18);
}

export async function createApiKey(userId: string, name: string) {
  const safeName = name.trim().replace(/\s+/g, " ");
  if (safeName.length < 1 || safeName.length > 120) {
    throw new Error("API key name must be between 1 and 120 characters");
  }

  const [activeCount] = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM api_keys
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `;

  if (Number(activeCount?.count ?? 0) >= MAX_ACTIVE_API_KEYS_PER_USER) {
    throw new Error(`Maximum of ${MAX_ACTIVE_API_KEYS_PER_USER} active API keys reached`);
  }

  const key = `fbfb_live_${randomBytes(24).toString("hex")}`;
  const [row] = await sql<Omit<ApiKeyRow, "role">[]>`
    INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
    VALUES (${userId}, ${safeName}, ${hashApiKey(key)}, ${keyPrefix(key)})
    RETURNING id, user_id, name, key_hash, key_prefix, last_used_at, revoked_at, created_at
  `;

  return { key, row };
}

export async function listApiKeys(userId: string) {
  return sql<Pick<ApiKeyRow, "id" | "name" | "key_prefix" | "last_used_at" | "revoked_at" | "created_at">[]>`
    SELECT id, name, key_prefix, last_used_at, revoked_at, created_at
    FROM api_keys
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function revokeApiKey(userId: string, keyId: string) {
  const [row] = await sql<{ id: string }[]>`
    UPDATE api_keys
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE id = ${keyId}
      AND user_id = ${userId}
    RETURNING id
  `;

  if (row) {
    lastUsedWriteCache.delete(row.id);
  }

  return Boolean(row);
}

export async function authenticateApiKey(key: string) {
  const [row] = await sql<ApiKeyRow[]>`
    SELECT ak.id, ak.user_id, ak.name, ak.key_hash, ak.key_prefix, ak.last_used_at, ak.revoked_at, ak.created_at, u.role
    FROM api_keys ak
    JOIN users u ON u.id = ak.user_id
    WHERE ak.key_hash = ${hashApiKey(key)}
      AND ak.revoked_at IS NULL
      AND u.status = 'active'
    LIMIT 1
  `;

  if (!row) {
    return null;
  }

  if (!lastUsedWriteCache.get(row.id)) {
    await sql`
      UPDATE api_keys
      SET last_used_at = NOW()
      WHERE id = ${row.id}
    `;
    lastUsedWriteCache.set(row.id, true, LAST_USED_WRITE_TTL_MS);
  }

  return row;
}

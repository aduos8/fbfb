import { sql } from "../db";
import { MemoryTtlCache } from "../memoryCache";
import { getActiveSubscription } from "./subscriptions";

export type PlanType = "basic" | "intermediate" | "advanced";
export type ApiOverrideMode = "default" | "allow" | "block";

export type ApiAccessSettings = {
  enabled: boolean;
  allowed_plan_types: PlanType[];
  updated_at: Date;
};

export type UserApiAccessOverride = {
  user_id: string;
  mode: ApiOverrideMode;
  reason: string | null;
  updated_at: Date;
};

const settingsCache = new MemoryTtlCache<ApiAccessSettings>(10);
const userAccessCache = new MemoryTtlCache<{ allowed: boolean; reason: string }>(1000);
const SETTINGS_CACHE_KEY = "api-access-settings";
const SETTINGS_TTL_MS = 30_000;
const USER_ACCESS_TTL_MS = 15_000;

const VALID_PLAN_TYPES = new Set<PlanType>(["basic", "intermediate", "advanced"]);

function normalizePlanTypes(value: unknown): PlanType[] {
  const input = Array.isArray(value) ? value : [];
  return input.filter((plan): plan is PlanType => VALID_PLAN_TYPES.has(plan as PlanType));
}

export async function getApiAccessSettings(): Promise<ApiAccessSettings> {
  const cached = settingsCache.get(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  const [row] = await sql<ApiAccessSettings[]>`
    SELECT enabled, allowed_plan_types, updated_at
    FROM api_access_settings
    WHERE id = true
    LIMIT 1
  `;

  const settings = row
    ? { ...row, allowed_plan_types: normalizePlanTypes(row.allowed_plan_types) }
    : { enabled: true, allowed_plan_types: ["intermediate" as const, "advanced" as const], updated_at: new Date(0) };

  settingsCache.set(SETTINGS_CACHE_KEY, settings, SETTINGS_TTL_MS);
  return settings;
}

export async function updateApiAccessSettings(input: {
  enabled: boolean;
  allowedPlanTypes: PlanType[];
  actorId: string;
}) {
  const plans = normalizePlanTypes(input.allowedPlanTypes);
  const [row] = await sql<ApiAccessSettings[]>`
    INSERT INTO api_access_settings (id, enabled, allowed_plan_types, updated_by, updated_at)
    VALUES (true, ${input.enabled}, ${plans}, ${input.actorId}, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      allowed_plan_types = EXCLUDED.allowed_plan_types,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING enabled, allowed_plan_types, updated_at
  `;
  settingsCache.clear();
  userAccessCache.clear();
  return { ...row, allowed_plan_types: normalizePlanTypes(row.allowed_plan_types) };
}

export async function getUserApiAccessOverride(userId: string): Promise<UserApiAccessOverride | null> {
  const [row] = await sql<UserApiAccessOverride[]>`
    SELECT user_id, mode, reason, updated_at
    FROM user_api_access_overrides
    WHERE user_id = ${userId}
  `;
  return row ?? null;
}

export async function listUserApiAccessOverrides() {
  return sql<(UserApiAccessOverride & { email: string })[]>`
    SELECT o.user_id, o.mode, o.reason, o.updated_at, u.email
    FROM user_api_access_overrides o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.updated_at DESC
    LIMIT 200
  `;
}

export async function setUserApiAccessOverride(input: {
  userId: string;
  mode: ApiOverrideMode;
  reason?: string | null;
  actorId: string;
}) {
  const [row] = await sql<UserApiAccessOverride[]>`
    INSERT INTO user_api_access_overrides (user_id, mode, reason, updated_by, updated_at)
    VALUES (${input.userId}, ${input.mode}, ${input.reason ?? null}, ${input.actorId}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      mode = EXCLUDED.mode,
      reason = EXCLUDED.reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING user_id, mode, reason, updated_at
  `;
  userAccessCache.delete(input.userId);
  return row;
}

export async function resolveUserApiAccess(userId: string) {
  const cached = userAccessCache.get(userId);
  if (cached) return cached;

  const [settings, override, subscription] = await Promise.all([
    getApiAccessSettings(),
    getUserApiAccessOverride(userId),
    getActiveSubscription(userId),
  ]);

  let result: { allowed: boolean; reason: string };
  if (!settings.enabled) {
    result = { allowed: false, reason: "Public API access is disabled" };
  } else if (override?.mode === "block") {
    result = { allowed: false, reason: override.reason || "API access blocked for this account" };
  } else if (override?.mode === "allow") {
    result = { allowed: true, reason: "User override allows API access" };
  } else if (subscription && settings.allowed_plan_types.includes(subscription.plan_type)) {
    result = { allowed: true, reason: `${subscription.plan_type} plan allows API access` };
  } else {
    result = { allowed: false, reason: "Your plan does not include API access" };
  }

  userAccessCache.set(userId, result, USER_ACCESS_TTL_MS);
  return result;
}

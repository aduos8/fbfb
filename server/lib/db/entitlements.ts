import { sql } from "../db";

export type EntitlementStatus = "active" | "expired" | "revoked";

export interface UserEntitlement {
  id: string;
  user_id: string;
  code: string;
  status: EntitlementStatus;
  source: "addon" | "admin" | "plan";
  granted_at: Date;
  expires_at: Date | null;
  metadata: Record<string, unknown>;
}

export async function grantEntitlement(input: {
  userId: string;
  code: string;
  source?: "addon" | "admin" | "plan";
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<UserEntitlement> {
  const [row] = await sql<UserEntitlement[]>`
    INSERT INTO user_entitlements (user_id, code, status, source, expires_at, metadata)
    VALUES (
      ${input.userId},
      ${input.code},
      'active',
      ${input.source ?? "addon"},
      ${input.expiresAt ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING id, user_id, code, status, source, granted_at, expires_at, metadata
  `;

  return row;
}

export async function hasActiveEntitlement(userId: string, code: string): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT true as ok
    FROM user_entitlements
    WHERE user_id = ${userId}
      AND code = ${code}
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY granted_at DESC
    LIMIT 1
  `;

  return Boolean(row?.ok);
}

export async function listActiveEntitlements(userId: string): Promise<UserEntitlement[]> {
  return sql<UserEntitlement[]>`
    SELECT id, user_id, code, status, source, granted_at, expires_at, metadata
    FROM user_entitlements
    WHERE user_id = ${userId}
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY granted_at DESC
  `;
}

export async function createAddonPurchase(input: {
  userId: string;
  paymentSessionId: string;
  addonCode: string;
  addonName: string;
  amountCents: number;
}) {
  const [row] = await sql<{
    id: string;
    user_id: string;
    payment_session_id: string;
    addon_code: string;
    addon_name: string;
    amount_cents: number;
    status: "pending" | "completed" | "failed" | "expired";
    granted_entitlement_id: string | null;
    created_at: Date;
    completed_at: Date | null;
  }[]>`
    INSERT INTO addon_purchases (user_id, payment_session_id, addon_code, addon_name, amount_cents)
    VALUES (${input.userId}, ${input.paymentSessionId}, ${input.addonCode}, ${input.addonName}, ${input.amountCents})
    RETURNING id, user_id, payment_session_id, addon_code, addon_name, amount_cents, status, granted_entitlement_id, created_at, completed_at
  `;
  return row;
}

export async function getAddonPurchaseBySessionId(sessionId: string) {
  const [row] = await sql<{
    id: string;
    user_id: string;
    payment_session_id: string;
    addon_code: string;
    addon_name: string;
    amount_cents: number;
    status: "pending" | "completed" | "failed" | "expired";
    granted_entitlement_id: string | null;
    created_at: Date;
    completed_at: Date | null;
  }[]>`
    SELECT id, user_id, payment_session_id, addon_code, addon_name, amount_cents, status, granted_entitlement_id, created_at, completed_at
    FROM addon_purchases
    WHERE payment_session_id = ${sessionId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function completeAddonPurchase(addonPurchaseId: string, entitlementId: string) {
  await sql`
    UPDATE addon_purchases
    SET status = 'completed', granted_entitlement_id = ${entitlementId}, completed_at = NOW()
    WHERE id = ${addonPurchaseId}
  `;
}

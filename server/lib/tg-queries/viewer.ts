import { TRPCError } from "@trpc/server";
import { sql } from "../db";
import { getActiveSubscription } from "../db/subscriptions";
import { hasActiveEntitlement } from "../db/entitlements";

export type ViewerRole = "user" | "admin" | "owner";

export type ViewerAccess = {
  userId: string;
  role: ViewerRole;
  hasActiveSubscription: boolean;
  canBypassRedactions: boolean;
};

export async function getViewerAccess(input: {
  userId?: string | null;
  role?: string | null;
}): Promise<ViewerAccess> {
  if (!input.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const role = (input.role === "admin" || input.role === "owner" ? input.role : "user") as ViewerRole;
  const hasActiveSubscription = role === "admin" || role === "owner"
    ? true
    : Boolean(await getActiveSubscription(input.userId));

  return {
    userId: input.userId,
    role,
    hasActiveSubscription,
    canBypassRedactions: role === "admin" || role === "owner",
  };
}

export async function ensureSearchCredits(userId: string) {
  const [row] = await sql<{ balance: number }[]>`
    SELECT balance FROM credits WHERE user_id = ${userId}
  `;

  const balance = Number(row?.balance ?? 0);
  if (balance < 1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Insufficient credits",
      cause: { code: "INSUFFICIENT_CREDITS", balance },
    });
  }

  return balance;
}

export async function deductSearchCredit(userId: string, searchType: string, queryLabel: string) {
  return sql.begin(async (trx) => {
    const [updated] = await trx<{ balance: number }[]>`
      UPDATE credits
      SET balance = balance - 1, updated_at = NOW()
      WHERE user_id = ${userId} AND balance >= 1
      RETURNING balance
    `;

    if (!updated) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Insufficient credits",
        cause: { code: "INSUFFICIENT_CREDITS", balance: 0 },
      });
    }

    await trx`
      INSERT INTO credit_transactions (user_id, amount, type, reference, notes)
      VALUES (${userId}, -1, 'credit_deducted', ${`search:${searchType}`}, ${queryLabel || null})
    `;

    return Number(updated.balance);
  });
}

export async function canUseAdvancedFilters(userId: string, role?: string | null): Promise<boolean> {
  if (role === "admin" || role === "owner") return true;
  const sub = await getActiveSubscription(userId);
  if (sub && (sub.plan_type === "intermediate" || sub.plan_type === "advanced")) {
    return true;
  }
  return hasActiveEntitlement(userId, "premium-filters");
}

export async function canUseMessageSearch(userId: string, role?: string | null): Promise<boolean> {
  if (role === "admin" || role === "owner") return true;
  const sub = await getActiveSubscription(userId);
  if (sub && (sub.plan_type === "intermediate" || sub.plan_type === "advanced")) {
    return true;
  }
  return hasActiveEntitlement(userId, "data-unlock-messages");
}

export async function canViewMessageAnalytics(userId: string, role?: string | null): Promise<boolean> {
  return canUseMessageSearch(userId, role);
}

export async function canUseProfileFullAccess(userId: string, role?: string | null): Promise<boolean> {
  if (role === "admin" || role === "owner") return true;
  return hasActiveEntitlement(userId, "data-unlock-profile");
}

export async function canUseTrackingPack(userId: string, role?: string | null): Promise<boolean> {
  if (role === "admin" || role === "owner") return true;
  return hasActiveEntitlement(userId, "tracking-monitor");
}

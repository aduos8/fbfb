import { sql } from '../db';

export interface Voucher {
  id: string;
  code: string;
  credits: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: Date | null;
  active: boolean;
  created_at: Date;
}

export async function createVoucher(
  code: string,
  credits: number,
  maxUses?: number,
  expiresAt?: Date
): Promise<Voucher> {
  const [row] = await sql<Voucher[]>`
    INSERT INTO vouchers (code, credits, max_uses, expires_at, active)
    VALUES (${code}, ${credits}, ${maxUses ?? null}, ${expiresAt ?? null}, true)
    RETURNING id, code, credits, max_uses, current_uses, expires_at, active, created_at
  `;
  return row;
}

export async function getVoucherByCode(code: string): Promise<Voucher | null> {
  const [row] = await sql<Voucher[]>`
    SELECT id, code, credits, max_uses, current_uses, expires_at, active, created_at
    FROM vouchers WHERE code = ${code}
  `;
  return row ?? null;
}

export async function listVouchers(
  limit = 50,
  offset = 0
): Promise<Voucher[]> {
  return sql<Voucher[]>`
    SELECT id, code, credits, max_uses, current_uses, expires_at, active, created_at
    FROM vouchers ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function updateVoucher(
  id: string,
  updates: { credits?: number; max_uses?: number | null; expires_at?: Date | null; active?: boolean }
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.credits !== undefined) {
    sets.push(`credits = $${idx++}`);
    vals.push(updates.credits);
  }
  if (updates.max_uses !== undefined) {
    sets.push(`max_uses = $${idx++}`);
    vals.push(updates.max_uses);
  }
  if (updates.expires_at !== undefined) {
    sets.push(`expires_at = $${idx++}`);
    vals.push(updates.expires_at);
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${idx++}`);
    vals.push(updates.active);
  }

  if (sets.length === 0) return;

  const updateQuery = sets.map((s, i) => `${s} = $${i + 1}`).join(', ');
  const updateVals = Object.values(updates);
  await sql`UPDATE vouchers SET ${sql(updateQuery)} WHERE id = ${id}`;
}

export async function deactivateVoucher(id: string): Promise<void> {
  await sql`UPDATE vouchers SET active = false WHERE id = ${id}`;
}

export async function incrementVoucherUses(id: string): Promise<void> {
  await sql`UPDATE vouchers SET current_uses = current_uses + 1 WHERE id = ${id}`;
}

export async function listVoucherRedemptions(voucherId?: string): Promise<unknown[]> {
  if (voucherId) {
    const rows = await sql`
      SELECT vr.id, vr.user_id, vr.redeemed_at, v.code, v.credits
      FROM voucher_redemptions vr
      JOIN vouchers v ON v.id = vr.voucher_id
      WHERE vr.voucher_id = ${voucherId}
      ORDER BY vr.redeemed_at DESC
    `;
    return rows as unknown[];
  }
  const rows = await sql`
    SELECT vr.id, vr.user_id, vr.redeemed_at, v.code, v.credits
    FROM voucher_redemptions vr
    JOIN vouchers v ON v.id = vr.voucher_id
    ORDER BY vr.redeemed_at DESC
    LIMIT 100
  `;
  return rows as unknown[];
}

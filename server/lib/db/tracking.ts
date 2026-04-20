import { sql } from '../db';

export interface TrackingRecord {
  id: string;
  user_id: string;
  profile_user_id: string;
  profile_username: string | null;
  profile_display_name: string | null;
  status: 'active' | 'paused' | 'cancelled';
  created_at: Date;
  last_renewal_at: Date;
  cost_per_month: number;
}

export async function createTracking(
  userId: string,
  profileUserId: string,
  profileUsername: string | null,
  profileDisplayName: string | null
): Promise<TrackingRecord> {
  const [row] = await sql<TrackingRecord[]>`
    INSERT INTO profile_tracking (user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month)
    VALUES (${userId}, ${profileUserId}, ${profileUsername}, ${profileDisplayName}, 'active', 1)
    RETURNING id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
  `;
  return row;
}

export async function cancelTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET status = 'cancelled' WHERE id = ${id}`;
}

export async function pauseTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET status = 'paused' WHERE id = ${id}`;
}

export async function reactivateTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET status = 'active', last_renewal_at = NOW() WHERE id = ${id}`;
}

export async function renewTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET last_renewal_at = NOW() WHERE id = ${id}`;
}

export async function getActiveTrackings(userId: string): Promise<TrackingRecord[]> {
  return sql<TrackingRecord[]>`
    SELECT id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
    FROM profile_tracking
    WHERE user_id = ${userId} AND status IN ('active', 'paused')
    ORDER BY created_at DESC
  `;
}

export async function getTrackingByProfile(
  userId: string,
  profileUserId: string
): Promise<TrackingRecord | null> {
  const [row] = await sql<TrackingRecord[]>`
    SELECT id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
    FROM profile_tracking
    WHERE user_id = ${userId} AND profile_user_id = ${profileUserId} AND status != 'cancelled'
  `;
  return row ?? null;
}

export async function getTrackingById(id: string): Promise<TrackingRecord | null> {
  const [row] = await sql<TrackingRecord[]>`
    SELECT id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
    FROM profile_tracking WHERE id = ${id}
  `;
  return row ?? null;
}

export async function getAllActiveTrackings(): Promise<TrackingRecord[]> {
  return sql<TrackingRecord[]>`
    SELECT id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
    FROM profile_tracking WHERE status = 'active'
  `;
}

export async function getExpiredTrackings(daysSinceRenewal = 30): Promise<TrackingRecord[]> {
  return sql<TrackingRecord[]>`
    SELECT id, user_id, profile_user_id, profile_username, profile_display_name, status, cost_per_month, created_at, last_renewal_at
    FROM profile_tracking
    WHERE status = 'active'
      AND last_renewal_at < NOW() - INTERVAL '${daysSinceRenewal} days'
  `;
}

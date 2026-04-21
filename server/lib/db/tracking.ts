import { sql } from '../db';

const RENEWAL_WINDOW_DAYS = 30;
const RENEWAL_WINDOW_MS = RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type TrackingStatus = 'active' | 'paused' | 'cancelled';
export type TrackingFieldName =
  | 'username'
  | 'display_name'
  | 'bio'
  | 'profile_photo'
  | 'phone'
  | 'premium_status';

export interface TrackingObservedProfile {
  username: string | null;
  display_name: string | null;
  bio: string | null;
  profile_photo: string | null;
  phone: string | null;
  premium_status: boolean | null;
}

export interface TrackingRecord {
  id: string;
  user_id: string;
  profile_user_id: string;
  profile_username: string | null;
  profile_display_name: string | null;
  status: TrackingStatus;
  created_at: Date;
  last_renewal_at: Date;
  cost_per_month: number;
  observed_profile: TrackingObservedProfile;
  last_checked_at: Date | null;
  last_detected_change_at: Date | null;
  last_history_check_at: Date | null;
}

export interface TrackingEventRecord {
  id: string;
  tracking_id: string;
  user_id: string;
  profile_user_id: string;
  profile_username: string | null;
  field_name: TrackingFieldName;
  old_value: string | null;
  new_value: string | null;
  created_at: Date;
}

type TrackingRow = Omit<TrackingRecord, 'observed_profile'> & {
  observed_profile: TrackingObservedProfile | string | null;
  last_history_check_at: Date | string | null;
};

export function normalizeObservedProfile(value: TrackingObservedProfile | string | null | undefined): TrackingObservedProfile {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as Partial<TrackingObservedProfile>;
        } catch {
          return {};
        }
      })()
    : (value ?? {});

  return {
    username: typeof parsed.username === 'string' ? parsed.username : null,
    display_name: typeof parsed.display_name === 'string' ? parsed.display_name : null,
    bio: typeof parsed.bio === 'string' ? parsed.bio : null,
    profile_photo: typeof parsed.profile_photo === 'string' ? parsed.profile_photo : null,
    phone: typeof parsed.phone === 'string' ? parsed.phone : null,
    premium_status: typeof parsed.premium_status === 'boolean' ? parsed.premium_status : null,
  };
}

function mapTrackingRow(row: TrackingRow): TrackingRecord {
  return {
    ...row,
    observed_profile: normalizeObservedProfile(row.observed_profile),
    last_history_check_at: row.last_history_check_at
      ? new Date(row.last_history_check_at)
      : null,
  };
}

export function buildObservedProfile(input: Partial<TrackingObservedProfile>): TrackingObservedProfile {
  return normalizeObservedProfile(input as TrackingObservedProfile);
}

export function getNextRenewalAt(lastRenewalAt: Date | string) {
  const base = lastRenewalAt instanceof Date ? lastRenewalAt : new Date(lastRenewalAt);
  return new Date(base.getTime() + RENEWAL_WINDOW_MS);
}

export function isTrackingRenewalDue(lastRenewalAt: Date | string, now = new Date()) {
  return getNextRenewalAt(lastRenewalAt).getTime() <= now.getTime();
}

export async function createTracking(
  userId: string,
  profileUserId: string,
  profileUsername: string | null,
  profileDisplayName: string | null,
  observedProfile: TrackingObservedProfile
): Promise<TrackingRecord> {
  const [row] = await sql<TrackingRow[]>`
    INSERT INTO profile_tracking (
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      observed_profile,
      last_history_check_at
    )
    VALUES (
      ${userId},
      ${profileUserId},
      ${profileUsername},
      ${profileDisplayName},
      'active',
      1,
      ${JSON.stringify(observedProfile)}::jsonb,
      NOW()
    )
    RETURNING
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
  `;
  return mapTrackingRow(row);
}

export async function cancelTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET status = 'cancelled' WHERE id = ${id}`;
}

export async function pauseTracking(id: string): Promise<void> {
  await sql`UPDATE profile_tracking SET status = 'paused' WHERE id = ${id}`;
}

export async function reactivateTracking(id: string): Promise<void> {
  await sql`
    UPDATE profile_tracking
    SET status = 'active', last_renewal_at = NOW()
    WHERE id = ${id}
  `;
}

export async function renewTracking(id: string): Promise<void> {
  await sql`
    UPDATE profile_tracking
    SET status = 'active', last_renewal_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateTrackingSnapshot(input: {
  trackingId: string;
  profileUsername: string | null;
  profileDisplayName: string | null;
  observedProfile: TrackingObservedProfile;
  detectedChange: boolean;
}): Promise<void> {
  await sql`
    UPDATE profile_tracking
    SET
      profile_username = ${input.profileUsername},
      profile_display_name = ${input.profileDisplayName},
      observed_profile = ${JSON.stringify(input.observedProfile)}::jsonb,
      last_checked_at = NOW(),
      last_detected_change_at = CASE
        WHEN ${input.detectedChange} THEN NOW()
        ELSE last_detected_change_at
      END,
      last_history_check_at = NOW()
    WHERE id = ${input.trackingId}
  `;
}

export async function touchTrackingCheck(trackingId: string): Promise<void> {
  await sql`
    UPDATE profile_tracking
    SET last_checked_at = NOW()
    WHERE id = ${trackingId}
  `;
}

export async function createTrackingEvent(input: {
  trackingId: string;
  userId: string;
  profileUserId: string;
  profileUsername: string | null;
  fieldName: TrackingFieldName;
  oldValue: string | null;
  newValue: string | null;
}): Promise<TrackingEventRecord> {
  const [row] = await sql<TrackingEventRecord[]>`
    INSERT INTO tracking_events (
      tracking_id,
      user_id,
      profile_user_id,
      profile_username,
      field_name,
      old_value,
      new_value
    )
    VALUES (
      ${input.trackingId},
      ${input.userId},
      ${input.profileUserId},
      ${input.profileUsername},
      ${input.fieldName},
      ${input.oldValue},
      ${input.newValue}
    )
    RETURNING
      id,
      tracking_id,
      user_id,
      profile_user_id,
      profile_username,
      field_name,
      old_value,
      new_value,
      created_at
  `;
  return row;
}

export async function getTrackingEventsForUser(input: {
  userId: string;
  trackingId?: string;
  limit?: number;
}): Promise<TrackingEventRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  if (input.trackingId) {
    return sql<TrackingEventRecord[]>`
      SELECT
        event.id,
        event.tracking_id,
        event.user_id,
        event.profile_user_id,
        event.profile_username,
        event.field_name,
        event.old_value,
        event.new_value,
        event.created_at
      FROM tracking_events event
      JOIN profile_tracking tracking ON tracking.id = event.tracking_id
      WHERE tracking.user_id = ${input.userId}
        AND event.tracking_id = ${input.trackingId}
      ORDER BY event.created_at DESC
      LIMIT ${limit}
    `;
  }

  return sql<TrackingEventRecord[]>`
    SELECT
      event.id,
      event.tracking_id,
      event.user_id,
      event.profile_user_id,
      event.profile_username,
      event.field_name,
      event.old_value,
      event.new_value,
      event.created_at
    FROM tracking_events event
    JOIN profile_tracking tracking ON tracking.id = event.tracking_id
    WHERE tracking.user_id = ${input.userId}
    ORDER BY event.created_at DESC
    LIMIT ${limit}
  `;
}

export async function getActiveTrackings(userId: string): Promise<TrackingRecord[]> {
  const rows = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE user_id = ${userId}
      AND status IN ('active', 'paused')
    ORDER BY created_at DESC
  `;

  return rows.map(mapTrackingRow);
}

export async function getPausedTrackings(userId: string): Promise<TrackingRecord[]> {
  const rows = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE user_id = ${userId}
      AND status = 'paused'
    ORDER BY created_at DESC
  `;

  return rows.map(mapTrackingRow);
}

export async function getTrackingByProfile(
  userId: string,
  profileUserId: string
): Promise<TrackingRecord | null> {
  const [row] = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE user_id = ${userId}
      AND profile_user_id = ${profileUserId}
      AND status != 'cancelled'
  `;

  return row ? mapTrackingRow(row) : null;
}

export async function getTrackingById(id: string): Promise<TrackingRecord | null> {
  const [row] = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE id = ${id}
  `;

  return row ? mapTrackingRow(row) : null;
}

export async function getAllActiveTrackings(): Promise<TrackingRecord[]> {
  const rows = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE status = 'active'
  `;

  return rows.map(mapTrackingRow);
}

export async function getExpiredTrackings(daysSinceRenewal = RENEWAL_WINDOW_DAYS): Promise<TrackingRecord[]> {
  const rows = await sql<TrackingRow[]>`
    SELECT
      id,
      user_id,
      profile_user_id,
      profile_username,
      profile_display_name,
      status,
      cost_per_month,
      created_at,
      last_renewal_at,
      observed_profile,
      last_checked_at,
      last_detected_change_at,
      last_history_check_at
    FROM profile_tracking
    WHERE status = 'active'
      AND last_renewal_at < NOW() - INTERVAL '${daysSinceRenewal} days'
  `;

  return rows.map(mapTrackingRow);
}

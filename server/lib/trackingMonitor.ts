import { sql } from './db';
import {
  createTrackingEvent,
  getAllActiveTrackings,
  isTrackingRenewalDue,
  normalizeObservedProfile,
  pauseTracking,
  touchTrackingCheck,
  updateTrackingSnapshot,
  type TrackingFieldName,
  type TrackingObservedProfile,
  type TrackingRecord,
} from './db/tracking';
import {
  createBioUpdateNotification,
  createDisplayNameChangeNotification,
  createPhoneChangeNotification,
  createPremiumStatusChangeNotification,
  createProfilePhotoChangeNotification,
  createTrackingExpiredNotification,
  createTrackingRenewalNotification,
  createUsernameChangeNotification,
} from './db/notifications';
import { chargeTrackingCredits, loadObservedProfileForUser } from './trackingSupport';
import { getUserHistorySince, type HistoryChange } from './tg-queries/queries';

const TRACKING_MONITOR_LOCK_ID = 4_004_001;

type TrackingRow = Omit<TrackingRecord, 'observed_profile'> & {
  observed_profile: TrackingObservedProfile | string | null;
  last_history_check_at: Date | string | null;
};

function mapTrackingRow(row: TrackingRow): TrackingRecord {
  return {
    ...row,
    observed_profile: normalizeObservedProfile(row.observed_profile),
    last_history_check_at: row.last_history_check_at
      ? new Date(row.last_history_check_at)
      : null,
  };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isCycleRunning = false;

type TrackingChange = {
  fieldName: TrackingFieldName;
  oldValue: string | null;
  newValue: string | null;
  newRawValue: string | boolean | null;
};

function mapHistoryFieldToTrackingField(field: string): TrackingFieldName | null {
  switch (field) {
    case 'username':
      return 'username';
    case 'display_name':
      return 'display_name';
    case 'bio':
      return 'bio';
    case 'avatar':
    case 'profile_photo':
      return 'profile_photo';
    case 'phone':
    case 'phone_masked':
      return 'phone';
    default:
      return null;
  }
}

function formatTrackingValue(fieldName: TrackingFieldName, value: string | boolean | null) {
  if (value === null || value === undefined) {
    return null;
  }

  if (fieldName === 'premium_status') {
    return value ? 'active' : 'standard';
  }

  return String(value);
}

function diffObservedProfiles(current: TrackingObservedProfile, next: TrackingObservedProfile): TrackingChange[] {
  const entries: Array<{ fieldName: TrackingFieldName; currentValue: string | boolean | null; nextValue: string | boolean | null }> = [
    { fieldName: 'username', currentValue: current.username, nextValue: next.username },
    { fieldName: 'display_name', currentValue: current.display_name, nextValue: next.display_name },
    { fieldName: 'bio', currentValue: current.bio, nextValue: next.bio },
    { fieldName: 'profile_photo', currentValue: current.profile_photo, nextValue: next.profile_photo },
    { fieldName: 'phone', currentValue: current.phone, nextValue: next.phone },
    { fieldName: 'premium_status', currentValue: current.premium_status, nextValue: next.premium_status },
  ];

  return entries.flatMap((entry) => {
    if (entry.currentValue === entry.nextValue) {
      return [];
    }

    return [{
      fieldName: entry.fieldName,
      oldValue: formatTrackingValue(entry.fieldName, entry.currentValue),
      newValue: formatTrackingValue(entry.fieldName, entry.nextValue),
      newRawValue: entry.nextValue,
    }];
  });
}

async function notifyTrackingChange(tracking: TrackingRecord, change: TrackingChange) {
  const profileUsername = tracking.profile_username ?? tracking.profile_user_id;

  switch (change.fieldName) {
    case 'username':
      return createUsernameChangeNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername,
        change.oldValue ?? '(none)',
        change.newValue ?? '(none)'
      );
    case 'display_name':
      return createDisplayNameChangeNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername,
        change.oldValue ?? '(none)',
        change.newValue ?? '(none)'
      );
    case 'bio':
      return createBioUpdateNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername
      );
    case 'profile_photo':
      return createProfilePhotoChangeNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername,
        change.newValue ?? undefined
      );
    case 'phone':
      return createPhoneChangeNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername,
        change.oldValue,
        change.newValue
      );
    case 'premium_status':
      return createPremiumStatusChangeNotification(
        tracking.user_id,
        tracking.profile_user_id,
        profileUsername,
        Boolean(change.newRawValue)
      );
  }
}

async function ensureTrackingRenewal(tracking: TrackingRecord) {
  if (!isTrackingRenewalDue(tracking.last_renewal_at)) {
    return true;
  }

  const charged = await chargeTrackingCredits({
    userId: tracking.user_id,
    type: 'tracking_renewal',
    reference: `tracking:${tracking.id}`,
    notes: `Tracking renewal: ${tracking.profile_user_id}`,
    trackingId: tracking.id,
  });

  if (charged === null) {
    if (tracking.status !== 'paused') {
      await pauseTracking(tracking.id);
      await createTrackingExpiredNotification(
        tracking.user_id,
        tracking.profile_username,
        'Add credits to resume monitoring. Tracking will auto-renew when credits are available.'
      );
    }
    return false;
  }

  if (tracking.status === 'paused') {
    await sql`
      UPDATE profile_tracking
      SET status = 'active'
      WHERE id = ${tracking.id}
    `;
  }

  await createTrackingRenewalNotification(
    tracking.user_id,
    tracking.profile_username ?? tracking.profile_user_id
  );

  return true;
}

async function processHistoryChanges(
  tracking: TrackingRecord,
  observed: { profileUsername: string | null; profileDisplayName: string | null; observedProfile: TrackingObservedProfile }
): Promise<boolean> {
  const sinceDate = tracking.last_history_check_at ?? tracking.created_at;

  let historyChanges: HistoryChange[];
  try {
    historyChanges = await getUserHistorySince(tracking.profile_user_id, sinceDate);
  } catch (error) {
    console.error(`[tracking-monitor] Failed to query user_history for ${tracking.profile_user_id}:`, error);
    return false;
  }

  if (historyChanges.length === 0) {
    return false;
  }

  const changes: TrackingChange[] = [];
  const snapshotFields: Partial<Record<TrackingFieldName, string | null>> = {};

  for (const historyEntry of historyChanges) {
    const fieldName = mapHistoryFieldToTrackingField(historyEntry.field);
    if (!fieldName) {
      continue;
    }

    changes.push({
      fieldName,
      oldValue: historyEntry.old_value,
      newValue: historyEntry.new_value,
      newRawValue: historyEntry.new_value,
    });

    snapshotFields[fieldName] = historyEntry.new_value;
  }

  for (const change of changes) {
    await createTrackingEvent({
      trackingId: tracking.id,
      userId: tracking.user_id,
      profileUserId: tracking.profile_user_id,
      profileUsername: observed.profileUsername ?? tracking.profile_username,
      fieldName: change.fieldName,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });

    await notifyTrackingChange(
      {
        ...tracking,
        profile_username: observed.profileUsername ?? tracking.profile_username,
      },
      change
    );
  }

  const mergedSnapshot: TrackingObservedProfile = {
    username: snapshotFields.username ?? tracking.observed_profile.username,
    display_name: snapshotFields.display_name ?? tracking.observed_profile.display_name,
    bio: snapshotFields.bio ?? tracking.observed_profile.bio,
    profile_photo: snapshotFields.profile_photo ?? tracking.observed_profile.profile_photo,
    phone: snapshotFields.phone ?? tracking.observed_profile.phone,
    premium_status: (() => {
      const val = snapshotFields.premium_status;
      if (val === 'true') { return true; }
      if (val === 'false') { return false; }
      return tracking.observed_profile.premium_status;
    })(),
  };

  await updateTrackingSnapshot({
    trackingId: tracking.id,
    profileUsername: observed.profileUsername,
    profileDisplayName: observed.profileDisplayName ?? tracking.profile_display_name,
    observedProfile: mergedSnapshot,
    detectedChange: changes.length > 0,
  });

  return true;
}

async function processTracking(tracking: TrackingRecord) {
  const canContinue = await ensureTrackingRenewal(tracking);
  if (!canContinue) {
    return;
  }

  const observed = await loadObservedProfileForUser(tracking.profile_user_id);
  if (!observed) {
    await touchTrackingCheck(tracking.id);
    return;
  }

  const hasChanges = await processHistoryChanges(tracking, observed);
  if (hasChanges) {
    return;
  }

  const changes = diffObservedProfiles(tracking.observed_profile, observed.observedProfile);
  const profileUsername = observed.profileUsername ?? tracking.profile_username;

  for (const change of changes) {
    await createTrackingEvent({
      trackingId: tracking.id,
      userId: tracking.user_id,
      profileUserId: tracking.profile_user_id,
      profileUsername,
      fieldName: change.fieldName,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });

    await notifyTrackingChange(
      {
        ...tracking,
        profile_username: profileUsername,
      },
      change
    );
  }

  await updateTrackingSnapshot({
    trackingId: tracking.id,
    profileUsername,
    profileDisplayName: observed.profileDisplayName ?? tracking.profile_display_name,
    observedProfile: observed.observedProfile,
    detectedChange: changes.length > 0,
  });
}

export async function runTrackingMonitorCycle() {
  if (isCycleRunning) {
    return false;
  }

  isCycleRunning = true;
  let lockConnection: Awaited<ReturnType<typeof sql.reserve>> | null = null;

  try {
    lockConnection = await sql.reserve();
    const [lockRow] = await lockConnection<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${TRACKING_MONITOR_LOCK_ID}) AS locked
    `;

    if (!lockRow?.locked) {
      return false;
    }

    try {
      const activeTrackings = await getAllActiveTrackings();
      for (const tracking of activeTrackings) {
        await processTracking(tracking);
      }

      const pausedTrackings = await getPausedTrackingsForRenewalCheck();
      for (const tracking of pausedTrackings) {
        await processPausedTrackingRenewal(tracking);
      }
    } finally {
      await lockConnection`SELECT pg_advisory_unlock(${TRACKING_MONITOR_LOCK_ID})`;
    }

    return true;
  } finally {
    if (lockConnection) {
      await lockConnection.release();
    }
    isCycleRunning = false;
  }
}

async function getPausedTrackingsForRenewalCheck(): Promise<TrackingRecord[]> {
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
    WHERE status = 'paused'
  `;

  return rows.map(mapTrackingRow);
}

async function processPausedTrackingRenewal(tracking: TrackingRecord) {
  const charged = await chargeTrackingCredits({
    userId: tracking.user_id,
    type: 'tracking_renewal',
    reference: `tracking:${tracking.id}`,
    notes: `Tracking renewal: ${tracking.profile_user_id}`,
    trackingId: tracking.id,
  });

  if (charged === null) {
    return;
  }

  await sql`
    UPDATE profile_tracking
    SET status = 'active', last_renewal_at = NOW()
    WHERE id = ${tracking.id}
  `;

  await createTrackingRenewalNotification(
    tracking.user_id,
    tracking.profile_username ?? tracking.profile_user_id
  );
}

export function startTrackingMonitor() {
  if (intervalHandle || process.env.NODE_ENV === 'test' || process.env.TRACKING_MONITOR_ENABLED === 'false') {
    return;
  }

  const intervalMs = Number.parseInt(process.env.TRACKING_MONITOR_INTERVAL_MS ?? '60000', 10);
  const normalizedInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000;

  intervalHandle = setInterval(() => {
    void runTrackingMonitorCycle().catch((error) => {
      console.error('[tracking-monitor] cycle failed:', error);
    });
  }, normalizedInterval);

  if ('unref' in intervalHandle && typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }

  void runTrackingMonitorCycle().catch((error) => {
    console.error('[tracking-monitor] initial cycle failed:', error);
  });
}

export function stopTrackingMonitor() {
  if (!intervalHandle) {
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
}

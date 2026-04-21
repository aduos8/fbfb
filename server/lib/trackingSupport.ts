import { sql } from './db';
import type { UserRecord } from './tg-queries/queries';
import { getUserById } from './tg-queries/queries';
import { buildObservedProfile, type TrackingObservedProfile } from './db/tracking';

export type TrackingChargeType = 'tracking_start' | 'tracking_renewal';

export function buildObservedProfileFromUser(user: UserRecord): TrackingObservedProfile {
  return buildObservedProfile({
    username: user.username ?? null,
    display_name: user.display_name ?? null,
    bio: user.bio ?? null,
    profile_photo: user.avatar_url ?? null,
    phone: user.phone_masked ?? null,
    premium_status: typeof user.is_premium === 'boolean' ? user.is_premium : null,
  });
}

export async function loadObservedProfileForUser(profileUserId: string) {
  const user = await getUserById(profileUserId);
  if (!user) {
    return null;
  }

  return {
    user,
    observedProfile: buildObservedProfileFromUser(user),
    profileUsername: user.username ?? null,
    profileDisplayName: user.display_name ?? null,
  };
}

export async function chargeTrackingCredits(input: {
  userId: string;
  type: TrackingChargeType;
  reference: string;
  notes: string;
  trackingId?: string;
  reactivateTracking?: boolean;
}) {
  return sql.begin(async (trx) => {
    const [updated] = await trx<{ balance: number }[]>`
      UPDATE credits
      SET balance = balance - 1, updated_at = NOW()
      WHERE user_id = ${input.userId}
        AND balance >= 1
      RETURNING balance
    `;

    if (!updated) {
      return null;
    }

    await trx`
      INSERT INTO credit_transactions (user_id, amount, type, reference, notes)
      VALUES (${input.userId}, -1, ${input.type}, ${input.reference}, ${input.notes})
    `;

    if (input.trackingId) {
      if (input.reactivateTracking) {
        await trx`
          UPDATE profile_tracking
          SET status = 'active', last_renewal_at = NOW()
          WHERE id = ${input.trackingId}
        `;
      } else {
        await trx`
          UPDATE profile_tracking
          SET last_renewal_at = NOW()
          WHERE id = ${input.trackingId}
        `;
      }
    }

    return Number(updated.balance);
  });
}

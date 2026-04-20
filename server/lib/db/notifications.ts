import { sql } from '../db';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: NotificationData;
  read: boolean;
  created_at: Date;
}

export type NotificationType =
  | 'username_changed'
  | 'display_name_changed'
  | 'bio_updated'
  | 'profile_photo_changed'
  | 'premium_status_changed'
  | 'credits_low'
  | 'tracking_renewal'
  | 'tracking_expired'
  | 'subscription_expired'
  | 'system';

export interface NotificationData {
  profile_user_id?: string;
  profile_username?: string;
  old_value?: string;
  new_value?: string;
  avatar_url?: string;
  is_premium?: boolean;
  credits_balance?: number;
  renewal_days?: number;
  [key: string]: unknown;
}

export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<Notification> {
  const [row] = await sql<Notification[]>`
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (${userId}, ${type}, ${title}, ${body}, ${JSON.stringify(data)}::jsonb)
    RETURNING id, user_id, type, title, body, data, read, created_at
  `;
  return row;
}

export async function markNotificationRead(id: string): Promise<void> {
  await sql`UPDATE notifications SET read = true WHERE id = ${id}`;
}

export async function markAllRead(userId: string): Promise<void> {
  await sql`UPDATE notifications SET read = true WHERE user_id = ${userId}`;
}

export async function getUserNotifications(
  userId: string,
  limit = 20
): Promise<Notification[]> {
  return sql<Notification[]>`
    SELECT id, user_id, type, title, body, data, read, created_at
    FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await sql<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND read = false
  `;
  return Number(row?.count ?? 0);
}

export async function createUsernameChangeNotification(
  userId: string,
  profileUserId: string,
  profileUsername: string,
  oldUsername: string,
  newUsername: string
): Promise<Notification> {
  return createNotification(
    userId,
    'username_changed',
    'Username Changed',
    `Username changed from @${oldUsername} to @${newUsername}`,
    {
      profile_user_id: profileUserId,
      profile_username: profileUsername,
      old_value: oldUsername,
      new_value: newUsername,
    }
  );
}

export async function createDisplayNameChangeNotification(
  userId: string,
  profileUserId: string,
  profileUsername: string,
  oldName: string,
  newName: string
): Promise<Notification> {
  return createNotification(
    userId,
    'display_name_changed',
    'Display name changed',
    `Display name changed from '${oldName}' to '${newName}'`,
    {
      profile_user_id: profileUserId,
      profile_username: profileUsername,
      old_value: oldName,
      new_value: newName,
    }
  );
}

export async function createBioUpdateNotification(
  userId: string,
  profileUserId: string,
  profileUsername: string
): Promise<Notification> {
  return createNotification(
    userId,
    'bio_updated',
    'Bio updated',
    `Bio field modified on @${profileUsername}`,
    {
      profile_user_id: profileUserId,
      profile_username: profileUsername,
    }
  );
}

export async function createProfilePhotoChangeNotification(
  userId: string,
  profileUserId: string,
  profileUsername: string,
  avatarUrl?: string
): Promise<Notification> {
  return createNotification(
    userId,
    'profile_photo_changed',
    'Profile photo changed',
    `Profile photo updated on monitored account @${profileUsername}`,
    {
      profile_user_id: profileUserId,
      profile_username: profileUsername,
      avatar_url: avatarUrl,
    }
  );
}

export async function createPremiumStatusChangeNotification(
  userId: string,
  profileUserId: string,
  profileUsername: string,
  isPremium: boolean
): Promise<Notification> {
  return createNotification(
    userId,
    'premium_status_changed',
    'Premium status changed',
    `Account premium status changed from ${isPremium ? 'standard' : 'active'} to ${isPremium ? 'active' : 'standard'}`,
    {
      profile_user_id: profileUserId,
      profile_username: profileUsername,
      is_premium: isPremium,
    }
  );
}

export async function createCreditsLowNotification(
  userId: string,
  creditsBalance: number
): Promise<Notification> {
  return createNotification(
    userId,
    'credits_low',
    'Credits low warning',
    `Account balance below 15 credits. Consider purchasing a top-up.`,
    {
      credits_balance: creditsBalance,
    }
  );
}

export async function createTrackingRenewalNotification(
  userId: string,
  profileUsername: string,
  days: number = 30
): Promise<Notification> {
  return createNotification(
    userId,
    'tracking_renewal',
    'Tracking renewal processed',
    `Profile Monitor Pack has been renewed for ${days} days`,
    {
      profile_username: profileUsername,
      renewal_days: days,
    }
  );
}

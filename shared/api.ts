import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: z.string(),
  status: z.string(),
  email_verified: z.boolean(),
  two_fa_enabled: z.boolean(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
  balance: z.number(),
});
export type User = z.infer<typeof UserSchema>;

export const CreditTransactionSchema = z.object({
  id: z.string().uuid(),
  amount: z.number(),
  transaction_type: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});
export type CreditTransaction = z.infer<typeof CreditTransactionSchema>;

export const ProfileResultSchema = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isPremium: z.boolean(),
  firstSeen: z.string(),
  lastSeen: z.string(),
});
export type ProfileResult = z.infer<typeof ProfileResultSchema>;

export const ChannelResultSchema = z.object({
  chatId: z.string(),
  username: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  memberCount: z.number(),
  avatarUrl: z.string().nullable(),
  isVerified: z.boolean(),
});
export type ChannelResult = z.infer<typeof ChannelResultSchema>;

export const GroupResultSchema = z.object({
  chatId: z.string(),
  username: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  memberCount: z.number(),
  groupType: z.string(),
});
export type GroupResult = z.infer<typeof GroupResultSchema>;

export const MessageResultSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string().nullable(),
  text: z.string(),
  date: z.string(),
  mediaType: z.string().nullable(),
});
export type MessageResult = z.infer<typeof MessageResultSchema>;

export const PurchaseRecordSchema = z.object({
  id: z.string().uuid(),
  amount_cents: z.number(),
  credits_purchased: z.number(),
  status: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type PurchaseRecord = z.infer<typeof PurchaseRecordSchema>;

export const SubscriptionRecordSchema = z.object({
  id: z.string().uuid(),
  plan_type: z.string(),
  status: z.string(),
  credits_per_month: z.number(),
  price_cents: z.number(),
  created_at: z.string(),
  cancelled_at: z.string().nullable(),
});
export type SubscriptionRecord = z.infer<typeof SubscriptionRecordSchema>;

export const TrackingRecordSchema = z.object({
  id: z.string().uuid(),
  profile_user_id: z.string(),
  profile_username: z.string().nullable(),
  profile_display_name: z.string().nullable(),
  status: z.string(),
  cost_per_month: z.number(),
  created_at: z.string(),
  last_renewal_at: z.string(),
});
export type TrackingRecord = z.infer<typeof TrackingRecordSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  data: z.record(z.unknown()),
  read: z.boolean(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const CreditPackageSchema = z.object({
  credits: z.number(),
  price_cents: z.number(),
  label: z.string(),
});
export type CreditPackage = z.infer<typeof CreditPackageSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_cents: z.number(),
  credits_per_month: z.number(),
  features: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

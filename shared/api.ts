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

export const RedactedFieldSchema = z.enum([
  "userId",
  "username",
  "displayName",
  "bio",
  "profilePhoto",
  "phone",
  "messages",
  "groups",
  "channels",
]);
export type RedactedField = z.infer<typeof RedactedFieldSchema>;

export const RedactionMetadataSchema = z.object({
  applied: z.boolean(),
  type: z.enum(["none", "partial", "full", "masked"]),
  redactedFields: z.array(RedactedFieldSchema),
  reason: z.string().nullable(),
});
export type RedactionMetadata = z.infer<typeof RedactionMetadataSchema>;

export const RelevanceSchema = z.object({
  score: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  reasons: z.array(z.string()),
});
export type Relevance = z.infer<typeof RelevanceSchema>;

export const BasicUserMetadataSchema = z.object({
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  isTelegramPremium: z.boolean().nullable(),
  trackingStatus: z.string().nullable(),
});
export type BasicUserMetadata = z.infer<typeof BasicUserMetadataSchema>;

export const ProfileResultSchema = z.object({
  resultType: z.literal("profile"),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  telegramUserId: z.string().nullable(),
  basicMetadata: BasicUserMetadataSchema,
  bio: z.string().nullable().optional(),
  phoneMasked: z.string().nullable().optional(),
  relevance: RelevanceSchema,
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type ProfileResult = z.infer<typeof ProfileResultSchema>;

export const ChannelResultSchema = z.object({
  resultType: z.literal("channel"),
  channelTitle: z.string().nullable(),
  username: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  channelDescription: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  telegramChatId: z.string().nullable(),
  relevance: RelevanceSchema,
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type ChannelResult = z.infer<typeof ChannelResultSchema>;

export const GroupActivityMetricsSchema = z.object({
  messageCount: z.number().nullable(),
  memberCount: z.number().nullable(),
  participantCount: z.number().nullable(),
});
export type GroupActivityMetrics = z.infer<typeof GroupActivityMetricsSchema>;

export const GroupResultSchema = z.object({
  resultType: z.literal("group"),
  groupTitle: z.string().nullable(),
  groupType: z.string().nullable(),
  publicIndicator: z.enum(["public", "private"]),
  profilePhoto: z.string().nullable(),
  telegramChatId: z.string().nullable(),
  username: z.string().nullable(),
  groupDescription: z.string().nullable(),
  activityMetrics: GroupActivityMetricsSchema,
  relevance: RelevanceSchema,
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type GroupResult = z.infer<typeof GroupResultSchema>;

export const MessageSenderSchema = z.object({
  userId: z.string().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
});
export type MessageSender = z.infer<typeof MessageSenderSchema>;

export const MessageChatSchema = z.object({
  chatId: z.string().nullable(),
  title: z.string().nullable(),
  type: z.string().nullable(),
  username: z.string().nullable(),
});
export type MessageChat = z.infer<typeof MessageChatSchema>;

export const MessageResultSchema = z.object({
  resultType: z.literal("message"),
  messageId: z.string().nullable(),
  chatId: z.string().nullable(),
  timestamp: z.string().nullable(),
  snippet: z.string().nullable(),
  highlightedSnippet: z.string().nullable(),
  matchedTerms: z.array(z.string()),
  sender: MessageSenderSchema,
  chat: MessageChatSchema,
  hasMedia: z.boolean().nullable(),
  containsLinks: z.boolean().nullable(),
  contextLink: z.string().nullable(),
  relevance: RelevanceSchema,
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type MessageResult = z.infer<typeof MessageResultSchema>;

export const SearchResultSchema = z.discriminatedUnion("resultType", [
  ProfileResultSchema,
  ChannelResultSchema,
  GroupResultSchema,
  MessageResultSchema,
]);
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const UnifiedSearchResponseSchema = z.object({
  type: z.enum(["profile", "channel", "group", "message"]),
  results: z.array(SearchResultSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  creditsRemaining: z.number().optional(),
});
export type UnifiedSearchResponse = z.infer<typeof UnifiedSearchResponseSchema>;

export const HistoryEntrySchema = z.object({
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  changedAt: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const UserHistoryResponseSchema = z.object({
  displayNameHistory: z.array(HistoryEntrySchema),
  usernameHistory: z.array(HistoryEntrySchema),
  bioHistory: z.array(HistoryEntrySchema),
  phoneHistory: z.array(HistoryEntrySchema),
});
export type UserHistoryResponse = z.infer<typeof UserHistoryResponseSchema>;

export const LookupUserSchema = z.object({
  telegramUserId: z.string().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  bio: z.string().nullable(),
  premiumStatus: z.boolean().nullable(),
  trackingStatus: z.string().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type LookupUser = z.infer<typeof LookupUserSchema>;

export const LookupChatSchema = z.object({
  telegramChatId: z.string().nullable(),
  title: z.string().nullable(),
  username: z.string().nullable(),
  description: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  chatType: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  participantCount: z.number().nullable(),
  publicIndicator: z.enum(["public", "private"]).nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  redaction: RedactionMetadataSchema,
  isMasked: z.boolean().optional(),
  maskedType: z.string().optional(),
});
export type LookupChat = z.infer<typeof LookupChatSchema>;

export const LookupMessageSchema = z.object({
  messageId: z.string(),
  chatId: z.string(),
  timestamp: z.string().nullable(),
  content: z.string(),
  highlightedSnippet: z.string(),
  hasMedia: z.boolean().nullable(),
  containsLinks: z.boolean().nullable(),
  sender: MessageSenderSchema,
  chat: MessageChatSchema,
  contextLink: z.string(),
  redaction: RedactionMetadataSchema,
});
export type LookupMessage = z.infer<typeof LookupMessageSchema>;

export const LookupMessagesResponseSchema = z.object({
  items: z.array(LookupMessageSchema),
  nextCursor: z.string().nullable(),
});
export type LookupMessagesResponse = z.infer<typeof LookupMessagesResponseSchema>;

export const ChatActivityEntrySchema = z.object({
  chatId: z.string(),
  chatName: z.string().nullable(),
  username: z.string().nullable(),
  chatType: z.string().nullable(),
  firstMessageAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  messageCount: z.number(),
});
export type ChatActivityEntry = z.infer<typeof ChatActivityEntrySchema>;

export const FrequentWordSchema = z.object({
  word: z.string(),
  count: z.number(),
});
export type FrequentWord = z.infer<typeof FrequentWordSchema>;

export const UserAnalyticsSchema = z.object({
  userId: z.string().nullable(),
  bucket: z.string(),
  activeChats: z.array(ChatActivityEntrySchema),
  frequentWords: z.array(FrequentWordSchema),
  groups: z.array(ChatActivityEntrySchema),
  channels: z.array(ChatActivityEntrySchema),
});
export type UserAnalytics = z.infer<typeof UserAnalyticsSchema>;

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
  next_renewal_at: z.string(),
  last_detected_change_at: z.string().nullable(),
});
export type TrackingRecord = z.infer<typeof TrackingRecordSchema>;

export const TrackingEventSchema = z.object({
  id: z.string().uuid(),
  tracking_id: z.string().uuid(),
  profile_user_id: z.string(),
  profile_username: z.string().nullable(),
  field_name: z.enum([
    "username",
    "display_name",
    "bio",
    "profile_photo",
    "phone",
    "premium_status",
  ]),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  created_at: z.string(),
});
export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

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

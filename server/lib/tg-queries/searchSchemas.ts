import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
});

const optionalString = z.string().optional();

export const profileSearchFiltersSchema = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  userId: z.string().optional(),
}).default({});

const profileSearchFiltersInputSchema = z.object({
  username: optionalString,
  displayName: optionalString,
  display_name: optionalString,
  phone: optionalString,
  number: optionalString,
  bio: optionalString,
  userId: optionalString,
  user_id: optionalString,
}).default({}).transform((filters) => ({
  username: filters.username,
  displayName: filters.displayName ?? filters.display_name,
  phone: filters.phone ?? filters.number,
  bio: filters.bio,
  userId: filters.userId ?? filters.user_id,
}));

export const channelSearchFiltersSchema = z.object({
  username: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  channelId: z.string().optional(),
}).default({});

const channelSearchFiltersInputSchema = z.object({
  username: optionalString,
  title: optionalString,
  displayName: optionalString,
  display_name: optionalString,
  description: optionalString,
  bio: optionalString,
  channelId: optionalString,
  chatId: optionalString,
  chat_id: optionalString,
}).default({}).transform((filters) => ({
  username: filters.username,
  title: filters.title ?? filters.displayName ?? filters.display_name,
  description: filters.description ?? filters.bio,
  channelId: filters.channelId ?? filters.chatId ?? filters.chat_id,
}));

export const groupSearchFiltersSchema = z.object({
  username: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  chatId: z.string().optional(),
}).default({});

const groupSearchFiltersInputSchema = z.object({
  username: optionalString,
  displayName: optionalString,
  display_name: optionalString,
  description: optionalString,
  bio: optionalString,
  chatId: optionalString,
  chat_id: optionalString,
}).default({}).transform((filters) => ({
  username: filters.username,
  displayName: filters.displayName ?? filters.display_name,
  description: filters.description ?? filters.bio,
  chatId: filters.chatId ?? filters.chat_id,
}));

export const messageSearchFiltersSchema = z.object({
  senderUsername: z.string().optional(),
  senderUserId: z.string().optional(),
  chatId: z.string().optional(),
  keyword: z.string().optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  hasMedia: z.boolean().optional(),
  containsLinks: z.boolean().optional(),
  minLength: z.number().min(0).optional(),
}).default({});

const messageSearchFiltersInputSchema = z.object({
  senderUsername: optionalString,
  senderUserId: optionalString,
  chatId: optionalString,
  keyword: optionalString,
  username: optionalString,
  user_id: optionalString,
  chat_id: optionalString,
  dateStart: optionalString,
  dateEnd: optionalString,
  hasMedia: z.boolean().optional(),
  containsLinks: z.boolean().optional(),
  minLength: z.number().min(0).optional(),
}).default({}).transform((filters) => ({
  senderUsername: filters.senderUsername ?? filters.username,
  senderUserId: filters.senderUserId ?? filters.user_id,
  chatId: filters.chatId ?? filters.chat_id,
  keyword: filters.keyword,
  dateStart: filters.dateStart,
  dateEnd: filters.dateEnd,
  hasMedia: filters.hasMedia,
  containsLinks: filters.containsLinks,
  minLength: filters.minLength,
}));

export const profileSearchSchema = paginationSchema.extend({
  type: z.literal("profile").default("profile"),
  query: z.string().optional(),
  filters: profileSearchFiltersInputSchema.pipe(profileSearchFiltersSchema),
});

export const channelSearchSchema = paginationSchema.extend({
  type: z.literal("channel").default("channel"),
  query: z.string().optional(),
  filters: channelSearchFiltersInputSchema.pipe(channelSearchFiltersSchema),
});

export const groupSearchSchema = paginationSchema.extend({
  type: z.literal("group").default("group"),
  query: z.string().optional(),
  filters: groupSearchFiltersInputSchema.pipe(groupSearchFiltersSchema),
});

export const messageSearchSchema = paginationSchema.extend({
  type: z.literal("message").default("message"),
  query: z.string().optional(),
  filters: messageSearchFiltersInputSchema.pipe(messageSearchFiltersSchema),
});

export const unifiedSearchSchema = z.discriminatedUnion("type", [
  profileSearchSchema,
  channelSearchSchema,
  groupSearchSchema,
  messageSearchSchema,
]);

export type ProfileSearchInput = z.infer<typeof profileSearchSchema>;
export type ChannelSearchInput = z.infer<typeof channelSearchSchema>;
export type GroupSearchInput = z.infer<typeof groupSearchSchema>;
export type MessageSearchInput = z.infer<typeof messageSearchSchema>;
export type UnifiedSearchInput = z.infer<typeof unifiedSearchSchema>;

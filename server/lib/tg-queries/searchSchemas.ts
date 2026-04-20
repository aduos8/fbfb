import { z } from "zod";

export const profileSearchSchema = z.object({
  query: z.string().optional(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  phoneHash: z.string().optional(),
  userId: z.string().optional(),
  limit: z.number().optional().default(25),
  offset: z.number().optional().default(0),
});

export const channelSearchSchema = z.object({
  query: z.string().optional(),
  username: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  chatId: z.string().optional(),
  limit: z.number().optional().default(25),
  offset: z.number().optional().default(0),
});

export const groupSearchSchema = z.object({
  query: z.string().optional(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  chatId: z.string().optional(),
  limit: z.number().optional().default(25),
  offset: z.number().optional().default(0),
});

export const messageSearchSchema = z.object({
  keyword: z.string().optional(),
  senderId: z.string().optional(),
  senderUsername: z.string().optional(),
  chatId: z.string().optional(),
  bucket: z.string().optional(),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  hasMedia: z.boolean().optional(),
  containsLinks: z.boolean().optional(),
  minLength: z.number().optional(),
});

export const unifiedSearchSchema = z.object({
  type: z.enum(["profile", "channel", "group", "message"]),
  q: z.string().optional(),
  filterChatId: z.string().optional(),
  filterBucket: z.string().optional(),
  filterSenderId: z.string().optional(),
  filterUsername: z.string().optional(),
  filterDateStart: z.string().optional(),
  filterDateEnd: z.string().optional(),
  filterHasMedia: z.boolean().optional(),
  filterHasLinks: z.boolean().optional(),
  filterMinLength: z.number().optional(),
  page: z.number().optional().default(1),
  limit: z.number().optional().default(25),
  offset: z.number().optional(),
});

export type ProfileSearchInput = z.infer<typeof profileSearchSchema>;
export type ChannelSearchInput = z.infer<typeof channelSearchSchema>;
export type GroupSearchInput = z.infer<typeof groupSearchSchema>;
export type MessageSearchInput = z.infer<typeof messageSearchSchema>;
export type UnifiedSearchInput = z.infer<typeof unifiedSearchSchema>;

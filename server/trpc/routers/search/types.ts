export interface ProfileResult {
  userId: string;
  username: string | null;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
  firstSeen: string;
  lastSeen: string;
}

export interface ChannelResult {
  chatId: string;
  username: string | null;
  title: string;
  description: string | null;
  memberCount: number;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface GroupResult {
  chatId: string;
  username: string | null;
  title: string;
  description: string | null;
  memberCount: number;
  groupType: "group" | "supergroup";
}

export interface MessageResult {
  chatId: string;
  messageId: string;
  userId: string | null;
  text: string;
  date: string;
  mediaType: string | null;
}

export interface SearchResponse<T> {
  results: T[];
  creditsRemaining: number;
  transactionId: string;
}

export interface MessageSearchResponse extends SearchResponse<MessageResult> {
  total: number;
}

export interface TelegramUser {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  isPremium: boolean;
  firstSeen: Date;
  lastSeen: Date;
}

export interface TelegramChannel {
  chatId: string;
  username: string;
  title: string;
  description: string;
  memberCount: number;
  avatarUrl: string;
  isVerified: boolean;
}

export interface TelegramGroup {
  chatId: string;
  username: string;
  title: string;
  description: string;
  memberCount: number;
  groupType: "group" | "supergroup";
}

export interface TelegramMessage {
  chatId: string;
  messageId: string;
  userId: string;
  text: string;
  date: Date;
  mediaType: string | null;
}

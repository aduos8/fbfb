import type {
  ProfileResult,
  ChannelResult,
  GroupResult,
  MessageResult,
  TelegramUser,
  TelegramChannel,
  TelegramGroup,
  TelegramMessage,
} from "./types";

const MOCK_USERS: TelegramUser[] = [
  {
    userId: "1234567890",
    username: "johndoe",
    displayName: "John Doe",
    bio: "Tech enthusiast and open source contributor. Building the future one commit at a time.",
    avatarUrl: "https://i.pravatar.cc/150?u=johndoe",
    isPremium: true,
    firstSeen: new Date("2023-01-15"),
    lastSeen: new Date(),
  },
  {
    userId: "2345678901",
    username: "alice_crypto",
    displayName: "Alice Chen",
    bio: "Blockchain developer | DeFi enthusiast | Not financial advice",
    avatarUrl: "https://i.pravatar.cc/150?u=alice_crypto",
    isPremium: true,
    firstSeen: new Date("2022-06-20"),
    lastSeen: new Date(Date.now() - 86400000),
  },
  {
    userId: "3456789012",
    username: "devmike",
    displayName: "Mike Roberts",
    bio: "Full-stack developer specializing in React and Node.js",
    avatarUrl: "https://i.pravatar.cc/150?u=devmike",
    isPremium: false,
    firstSeen: new Date("2023-03-10"),
    lastSeen: new Date(Date.now() - 172800000),
  },
  {
    userId: "4567890123",
    username: "sarah_tech",
    displayName: "Sarah Williams",
    bio: "ML engineer at BigTech. Love Python and coffee.",
    avatarUrl: "https://i.pravatar.cc/150?u=sarah_tech",
    isPremium: true,
    firstSeen: new Date("2021-11-05"),
    lastSeen: new Date(),
  },
  {
    userId: "5678901234",
    username: "cryptowhale",
    displayName: "Crypto Whale",
    bio: "Early Bitcoin adopter. HODLing since 2013.",
    avatarUrl: "https://i.pravatar.cc/150?u=cryptowhale",
    isPremium: false,
    firstSeen: new Date("2020-02-14"),
    lastSeen: new Date(Date.now() - 3600000),
  },
  {
    userId: "6789012345",
    username: "ux_designer",
    displayName: "Emma Thompson",
    bio: "UX/UI Designer | Design systems | Accessibility advocate",
    avatarUrl: "https://i.pravatar.cc/150?u=ux_designer",
    isPremium: true,
    firstSeen: new Date("2023-05-22"),
    lastSeen: new Date(),
  },
  {
    userId: "7890123456",
    username: "security_pro",
    displayName: "Alex Morgan",
    bio: "Cybersecurity expert | Penetration tester | Bug bounty hunter",
    avatarUrl: "https://i.pravatar.cc/150?u=security_pro",
    isPremium: false,
    firstSeen: new Date("2022-09-30"),
    lastSeen: new Date(Date.now() - 7200000),
  },
  {
    userId: "8901234567",
    username: "data_scientist",
    displayName: "Lisa Park",
    bio: "Data scientist | Python | Machine Learning | AI research",
    avatarUrl: "https://i.pravatar.cc/150?u=data_scientist",
    isPremium: true,
    firstSeen: new Date("2023-02-18"),
    lastSeen: new Date(),
  },
];

const MOCK_CHANNELS: TelegramChannel[] = [
  {
    chatId: "9876543210",
    username: "technews",
    title: "Tech News Daily",
    description: "Your daily dose of technology news. Covering AI, gadgets, software, and more.",
    memberCount: 125000,
    avatarUrl: "https://i.pravatar.cc/150?u=technews",
    isVerified: true,
  },
  {
    chatId: "8765432109",
    username: "cryptocurrency",
    title: "Crypto Signals & News",
    description: "Real-time crypto signals, market analysis, and news updates.",
    memberCount: 89000,
    avatarUrl: "https://i.pravatar.cc/150?u=cryptonews",
    isVerified: true,
  },
  {
    chatId: "7654321098",
    username: "programming_hub",
    title: "Programming Hub",
    description: "Code snippets, tutorials, and programming discussions.",
    memberCount: 67000,
    avatarUrl: "https://i.pravatar.cc/150?u=prog_hub",
    isVerified: false,
  },
  {
    chatId: "6543210987",
    username: "ai_research",
    title: "AI Research Papers",
    description: "Sharing the latest AI/ML research papers and summaries.",
    memberCount: 45000,
    avatarUrl: "https://i.pravatar.cc/150?u=airesearch",
    isVerified: true,
  },
  {
    chatId: "5432109876",
    username: "security_alerts",
    title: "Security Alerts",
    description: "Cybersecurity news, vulnerability alerts, and security tips.",
    memberCount: 38000,
    avatarUrl: "https://i.pravatar.cc/150?u=sec_alerts",
    isVerified: false,
  },
];

const MOCK_GROUPS: TelegramGroup[] = [
  {
    chatId: "5555555555",
    username: "programming",
    title: "Programming Community",
    description: "A community for programmers to share knowledge and help each other.",
    memberCount: 25000,
    groupType: "supergroup",
  },
  {
    chatId: "4444444444",
    username: "crypto_traders",
    title: "Crypto Traders Club",
    description: "Discuss trading strategies, market trends, and share analysis.",
    memberCount: 18000,
    groupType: "supergroup",
  },
  {
    chatId: "3333333333",
    username: "webdevs",
    title: "Web Developers",
    description: "Frontend, backend, and full-stack development discussions.",
    memberCount: 15000,
    groupType: "supergroup",
  },
  {
    chatId: "2222222222",
    username: "ml_community",
    title: "Machine Learning Community",
    description: "ML practitioners sharing models, datasets, and techniques.",
    memberCount: 12000,
    groupType: "supergroup",
  },
  {
    chatId: "1111111111",
    username: "startup_founders",
    title: "Startup Founders",
    description: "Connect with fellow founders, share experiences, and get advice.",
    memberCount: 8000,
    groupType: "group",
  },
];

const MOCK_MESSAGES: TelegramMessage[] = [
  {
    chatId: "9876543210",
    messageId: "1001",
    userId: "1234567890",
    text: "Just released a new version of our open-source framework! Check it out on GitHub.",
    date: new Date(Date.now() - 3600000),
    mediaType: null,
  },
  {
    chatId: "9876543210",
    messageId: "1002",
    userId: "2345678901",
    text: "The new AI model is incredible. It can generate code from natural language descriptions.",
    date: new Date(Date.now() - 7200000),
    mediaType: null,
  },
  {
    chatId: "8765432109",
    messageId: "2001",
    userId: "5678901234",
    text: "Bitcoin just broke through the resistance level. Looking bullish for the next few weeks.",
    date: new Date(Date.now() - 1800000),
    mediaType: null,
  },
  {
    chatId: "8765432109",
    messageId: "2002",
    userId: "2345678901",
    text: "Ethereum gas fees are finally dropping. Good time to do some DeFi.",
    date: new Date(Date.now() - 5400000),
    mediaType: null,
  },
  {
    chatId: "7654321098",
    messageId: "3001",
    userId: "3456789012",
    text: "Anyone know how to properly handle async/await errors in TypeScript?",
    date: new Date(Date.now() - 900000),
    mediaType: null,
  },
  {
    chatId: "7654321098",
    messageId: "3002",
    userId: "1234567890",
    text: "Try using a wrapper function with try-catch that returns a Result type. Much cleaner than multiple catch blocks.",
    date: new Date(Date.now() - 600000),
    mediaType: null,
  },
  {
    chatId: "6543210987",
    messageId: "4001",
    userId: "8901234567",
    text: "New paper on transformer architectures just dropped. The efficiency improvements are remarkable.",
    date: new Date(Date.now() - 10800000),
    mediaType: null,
  },
  {
    chatId: "5432109876",
    messageId: "5001",
    userId: "7890123456",
    text: "Critical vulnerability discovered in popular npm package. Update immediately if you use it.",
    date: new Date(Date.now() - 300000),
    mediaType: null,
  },
  {
    chatId: "5555555555",
    messageId: "6001",
    userId: "6789012345",
    text: "Just finished a complete redesign of our component library. Happy to share the Figma file!",
    date: new Date(Date.now() - 14400000),
    mediaType: null,
  },
  {
    chatId: "5555555555",
    messageId: "6002",
    userId: "3456789012",
    text: "Would love to take a look. Can you share the link?",
    date: new Date(Date.now() - 13800000),
    mediaType: null,
  },
];

function formatDate(date: Date): string {
  return date.toISOString();
}

function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

function matchesQuery(text: string, query: string): boolean {
  const normalizedText = normalizeString(text);
  const normalizedQuery = normalizeString(query);
  return normalizedText.includes(normalizedQuery);
}

function sanitizeQuery(query: string): string {
  return query.trim().slice(0, 255);
}

export async function searchProfiles(
  rawQuery: string,
  searchBy: "username" | "id" | "name" = "username",
  limit: number = 20
): Promise<ProfileResult[]> {
  const query = sanitizeQuery(rawQuery);
  if (!query) return [];

  let results = MOCK_USERS;

  switch (searchBy) {
    case "username":
      results = MOCK_USERS.filter(
        (u) => u.username && matchesQuery(u.username, query)
      );
      break;
    case "id":
      results = MOCK_USERS.filter((u) => u.userId.includes(query));
      break;
    case "name":
      results = MOCK_USERS.filter(
        (u) =>
          matchesQuery(u.displayName, query) ||
          (u.bio && matchesQuery(u.bio, query))
      );
      break;
  }

  return results.slice(0, limit).map((u) => ({
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isPremium: u.isPremium,
    firstSeen: formatDate(u.firstSeen),
    lastSeen: formatDate(u.lastSeen),
  }));
}

export async function searchChannels(
  rawQuery: string,
  limit: number = 20
): Promise<ChannelResult[]> {
  const query = sanitizeQuery(rawQuery);
  if (!query) return [];

  const results = MOCK_CHANNELS.filter(
    (c) =>
      (c.username && matchesQuery(c.username, query)) ||
      matchesQuery(c.title, query) ||
      (c.description && matchesQuery(c.description, query))
  );

  return results.slice(0, limit).map((c) => ({
    chatId: c.chatId,
    username: c.username,
    title: c.title,
    description: c.description,
    memberCount: c.memberCount,
    avatarUrl: c.avatarUrl,
    isVerified: c.isVerified,
  }));
}

export async function searchGroups(
  rawQuery: string,
  limit: number = 20
): Promise<GroupResult[]> {
  const query = sanitizeQuery(rawQuery);
  if (!query) return [];

  const results = MOCK_GROUPS.filter(
    (g) =>
      (g.username && matchesQuery(g.username, query)) ||
      matchesQuery(g.title, query) ||
      (g.description && matchesQuery(g.description, query))
  );

  return results.slice(0, limit).map((g) => ({
    chatId: g.chatId,
    username: g.username,
    title: g.title,
    description: g.description,
    memberCount: g.memberCount,
    groupType: g.groupType,
  }));
}

export async function searchMessages(
  rawQuery: string,
  limit: number = 50,
  chatId?: string
): Promise<{ results: MessageResult[]; total: number }> {
  const query = sanitizeQuery(rawQuery);
  if (!query) return { results: [], total: 0 };

  let results = MOCK_MESSAGES.filter((m) => matchesQuery(m.text, query));

  if (chatId) {
    results = results.filter((m) => m.chatId === chatId);
  }

  const total = results.length;
  const paginatedResults = results.slice(0, limit).map((m) => ({
    chatId: m.chatId,
    messageId: m.messageId,
    userId: m.userId,
    text: m.text,
    date: formatDate(m.date),
    mediaType: m.mediaType,
  }));

  return { results: paginatedResults, total };
}

export async function getProfileById(userId: string): Promise<ProfileResult | null> {
  const user = MOCK_USERS.find((u) => u.userId === userId);
  if (!user) return null;

  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    isPremium: user.isPremium,
    firstSeen: formatDate(user.firstSeen),
    lastSeen: formatDate(user.lastSeen),
  };
}

export async function getChannelById(chatId: string): Promise<ChannelResult | null> {
  const channel = MOCK_CHANNELS.find((c) => c.chatId === chatId);
  if (!channel) return null;

  return {
    chatId: channel.chatId,
    username: channel.username,
    title: channel.title,
    description: channel.description,
    memberCount: channel.memberCount,
    avatarUrl: channel.avatarUrl,
    isVerified: channel.isVerified,
  };
}

export async function getGroupById(chatId: string): Promise<GroupResult | null> {
  const group = MOCK_GROUPS.find((g) => g.chatId === chatId);
  if (!group) return null;

  return {
    chatId: group.chatId,
    username: group.username,
    title: group.title,
    description: group.description,
    memberCount: group.memberCount,
    groupType: group.groupType,
  };
}

export async function getUserMessages(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ results: MessageResult[]; total: number }> {
  const results = MOCK_MESSAGES.filter((m) => m.userId === userId);
  const total = results.length;
  const paginatedResults = results.slice(offset, offset + limit).map((m) => ({
    chatId: m.chatId,
    messageId: m.messageId,
    userId: m.userId,
    text: m.text,
    date: formatDate(m.date),
    mediaType: m.mediaType,
  }));

  return { results: paginatedResults, total };
}

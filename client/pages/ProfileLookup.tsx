import { useParams, Link } from "react-router-dom";
import { trpc } from "@/lib/trpc";

type HistoryEntry = {
  oldValue: string | null;
  newValue: string | null;
  changedAt: string | null;
};

type ChatEntry = {
  chat_id: string;
  display_name: string | null;
  username: string | null;
  chat_type: string | null;
  message_count: number;
};

function HistorySection({ title, entries, icon }: { title: string; entries: HistoryEntry[]; icon: React.ReactNode }) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[#3A2AEE]">{icon}</span>
        <h2 className="font-sans font-semibold text-[14px] text-white">{title}</h2>
      </div>
      <div className="space-y-2">
        {entries.slice(0, 10).map((entry, i) => (
          <div key={i} className="flex items-center gap-3 text-[12px]">
            <span className="text-white/40 font-mono truncate flex-1 max-w-[120px]">
              {entry.oldValue || "(none)"}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#3A2AEE] flex-shrink-0">
              <path d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-white/70 font-mono truncate flex-1 max-w-[120px]">
              {entry.newValue || "(none)"}
            </span>
            {entry.changedAt && (
              <span className="text-white/30 text-[10px] flex-shrink-0">
                {new Date(entry.changedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatsSection({ title, chats, chatType }: { title: string; chats: ChatEntry[]; chatType?: string }) {
  const filtered = chatType ? chats.filter(c => c.chat_type === chatType) : chats;
  if (filtered.length === 0) return null;

  return (
    <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <h2 className="font-sans font-semibold text-[14px] text-white mb-4">{title}</h2>
      <div className="space-y-2">
        {filtered.slice(0, 20).map((chat) => (
          <div key={chat.chat_id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[rgba(58,42,238,0.2)] flex items-center justify-center flex-shrink-0">
                {chat.chat_type === "channel" ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11.9999 4.66671V2.00005C11.9999 1.76671 11.8733 1.54671 11.6733 1.42671C11.5733 1.36841 11.4599 1.33714 11.3441 1.33597C11.2284 1.3348 11.1144 1.36378 11.0133 1.42005L5.15992 4.66671H2.66659C1.93325 4.66671 1.33325 5.26671 1.33325 6.00005V9.33338C1.33325 10.0667 1.93325 10.6667 2.66659 10.6667H4.66659V14.6667H5.99992V11.0267L11.0599 13.2734C11.1466 13.3134 11.2399 13.3334 11.3333 13.3334C11.5095 13.3316 11.6781 13.2608 11.8027 13.1362C11.9274 13.0115 11.9982 12.843 11.9999 12.6667V10C13.4733 10 14.6666 8.80671 14.6666 7.33338C14.6666 5.86005 13.4733 4.66671 11.9999 4.66671Z" fill="#3A2AEE"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M7.99992 7.33398C9.13992 7.33398 9.99992 6.47398 9.99992 5.33398C9.99992 4.19398 9.13992 3.33398 7.99992 3.33398C6.85992 3.33398 5.99992 4.19398 5.99992 5.33398C5.99992 6.47398 6.85992 7.33398 7.99992 7.33398ZM7.99992 4.66732C8.39992 4.66732 8.66658 4.93398 8.66658 5.33398C8.66658 5.73398 8.39992 6.00065 7.99992 6.00065C7.59992 6.00065 7.33325 5.73398 7.33325 5.33398C7.33325 4.93398 7.59992 4.66732 7.99992 4.66732ZM8.66658 8.00065H7.33325C5.49325 8.00065 3.99992 9.49398 3.99992 11.334V11.6673C3.99992 12.2207 4.44659 12.6673 4.99992 12.6673H10.9999C11.5533 12.6673 11.9999 12.2207 11.9999 11.6673V11.334C11.9999 9.49398 10.5066 8.00065 8.66658 8.00065Z" fill="#3A2AEE"/>
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-sans text-[13px] text-white truncate">
                  {chat.display_name || chat.username || "Unknown Chat"}
                </p>
                <p className="font-sans text-[10px] text-[#3A2AEE]">
                  {chat.username ? `@${chat.username}` : chat.chat_id}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <p className="font-sans text-[12px] text-white/70">
                {chat.message_count.toLocaleString()}
              </p>
              <p className="font-sans text-[9px] text-white/30">messages</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProfileLookup() {
  const { id } = useParams<{ id: string }>();

  const { data: user, isLoading: userLoading, error: userError } = trpc.lookup.getUser.useQuery(
    { userId: id! },
    { enabled: !!id }
  );

  const { data: analytics } = trpc.analytics.getUserAnalytics.useQuery(
    { userId: id! },
    { enabled: !!id }
  );

  const { data: userHistory } = trpc.lookup.getUserHistory.useQuery(
    { userId: id! },
    { enabled: !!id }
  );

  const { data: userChats } = trpc.lookup.getUserChats.useQuery(
    { userId: id! },
    { enabled: !!id }
  );

  type AnalyticsData = {
    activeChats?: { chat_id: string; first_message_at?: string; last_message_at?: string }[];
    frequentWords?: { word: string; count: number }[];
  };
  const analyticsData = (analytics as AnalyticsData) || { activeChats: [], frequentWords: [] };

  const userData = user as {
    user_id?: string;
    username?: string;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
  } | null;

  const historyData = userHistory as {
    displayNameHistory: HistoryEntry[];
    usernameHistory: HistoryEntry[];
    bioHistory: HistoryEntry[];
  } | null;

  const chatsData = (userChats || []) as ChatEntry[];

  const getAvatar = () => {
    if (userData?.avatar_url) return userData.avatar_url;
    return `https://i.pravatar.cc/150?u=${userData?.user_id || id}`;
  };

  const groupsChats = chatsData.filter(c => c.chat_type === "group" || c.chat_type === "supergroup");
  const channelChats = chatsData.filter(c => c.chat_type === "channel");

  return (
    <div className="min-h-screen bg-[#0F0F11]">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div className="px-8 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-sans font-normal text-[12px] text-[rgba(255,255,255,0.6)] hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to search
          </Link>
        </div>

        <div className="px-8 py-6">
          {userLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {(userError || !userData) && !userLoading && (
            <div className="p-6 rounded-[12px]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="font-sans text-[14px] text-red-400">
                {userError?.message || "Error loading profile"}
              </p>
            </div>
          )}

          {userData && !userLoading && (
            <div className="space-y-6">
              <div className="flex items-center gap-5">
                <div
                  className="w-[80px] h-[80px] rounded-[14px] overflow-hidden flex items-center justify-center"
                  style={{ background: "rgba(58,42,238,0.15)" }}
                >
                  {userData.avatar_url ? (
                    <img
                      src={getAvatar()}
                      alt={userData.display_name || userData.username || "User"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[#3A2AEE] text-[32px] font-bold">
                      {(userData.display_name || userData.username || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="font-sans font-semibold text-[28px] text-white">
                    {userData.display_name || userData.username || "Unknown User"}
                  </h1>
                  {userData.username && (
                    <p className="font-sans text-[14px] text-[#3A2AEE]">@{userData.username}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-sans text-[12px] text-[rgba(255,255,255,0.4)] font-mono">
                      ID: {userData.user_id}
                    </span>
                  </div>
                </div>
              </div>

              {userData.bio && (
                <div className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.08)", border: "1px solid rgba(58,42,238,0.15)" }}>
                  <p className="font-sans text-[13px] text-white/70 whitespace-pre-wrap">{userData.bio as string}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Joined</p>
                  <p className="font-sans text-[18px] text-white font-semibold">
                    {userData.created_at
                      ? new Date(userData.created_at as string).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </p>
                </div>
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Chats</p>
                  <p className="font-sans text-[18px] text-white font-semibold">
                    {analyticsData.activeChats?.length || chatsData.length || 0}
                  </p>
                </div>
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Last Seen</p>
                  <p className="font-sans text-[14px] text-white/70">
                    {userData.updated_at
                      ? new Date(userData.updated_at as string).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </p>
                </div>
              </div>

              {analyticsData.frequentWords && analyticsData.frequentWords.length > 0 && (
                <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <h2 className="font-sans font-semibold text-[14px] text-white mb-4">Frequently Used Words</h2>
                  <div className="flex flex-wrap gap-2">
                    {analyticsData.frequentWords.slice(0, 50).map((w: any, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full text-[11px] font-medium"
                        style={{
                          background: "rgba(58,42,238,0.15)",
                          color: "#B8A8FF",
                          opacity: 1 - (i * 0.02),
                        }}
                      >
                        {w.word} ({w.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(historyData?.displayNameHistory?.length || historyData?.usernameHistory?.length || historyData?.bioHistory?.length) && (
                <div className="space-y-4">
                  <h2 className="font-sans font-semibold text-[16px] text-white">Identity History</h2>
                  <HistorySection
                    title="Display Name Changes"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8ZM8 10C11.3137 10 14 12.6863 14 16H2C2 12.6863 4.68629 10 8 10Z" fill="currentColor"/>
                      </svg>
                    }
                    entries={historyData?.displayNameHistory || []}
                  />
                  <HistorySection
                    title="Username Changes"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M2.66665 2.66602H13.3333M2.66665 13.3327H13.3333M5.99998 6.66602C6.7366 6.66602 7.33331 6.0693 7.33331 5.33268C7.33331 4.59606 6.7366 3.99935 5.99998 3.99935C5.26336 3.99935 4.66665 4.59606 4.66665 5.33268C4.66665 6.0693 5.26336 6.66602 5.99998 6.66602ZM5.99998 12.666C6.7366 12.666 7.33331 12.0693 7.33331 11.3327C7.33331 10.5961 6.7366 9.99935 5.99998 9.99935C5.26336 9.99935 4.66665 10.5961 4.66665 11.3327C4.66665 12.0693 5.26336 12.666 5.99998 12.666ZM10.9999 8.66602C11.7366 8.66602 12.3333 8.0693 12.3333 7.33268C12.3333 6.59606 11.7366 5.99935 10.9999 5.99935C10.2633 5.99935 9.66662 6.59606 9.66662 7.33268C9.66662 8.0693 10.2633 8.66602 10.9999 8.66602Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    }
                    entries={historyData?.usernameHistory || []}
                  />
                  <HistorySection
                    title="Bio Changes"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M2.66665 3.99935H13.3333M2.66665 7.99935H13.3333M2.66665 11.9994H8.66665" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    }
                    entries={historyData?.bioHistory || []}
                  />
                </div>
              )}

              {chatsData.length > 0 && (
                <div className="space-y-4">
                  <h2 className="font-sans font-semibold text-[16px] text-white">Chat Activity</h2>
                  <ChatsSection
                    title="Groups"
                    chats={chatsData}
                    chatType="group"
                  />
                  <ChatsSection
                    title="Channels"
                    chats={chatsData}
                    chatType="channel"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

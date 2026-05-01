import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { ChatActivityEntry, LookupMessage, LookupMessagesResponse, LookupUser, TrackingRecord, UserAnalytics, UserHistoryResponse } from "@shared/api";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-sans text-[14px] text-white/80">{value}</p>
    </div>
  );
}

function HistorySection({
  title,
  entries,
  initialVisibleCount = 20,
}: {
  title: string;
  entries: UserHistoryResponse["displayNameHistory"];
  initialVisibleCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const hasMore = entries.length > initialVisibleCount;
  const visibleEntries = expanded ? entries : entries.slice(0, initialVisibleCount);

  return (
    <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <h2 className="font-sans font-semibold text-[14px] text-white mb-4">{title}</h2>
      <div className="space-y-2">
        {visibleEntries.map((entry, index) => (
          <div key={`${title}-${index}`} className="flex items-center gap-3 text-[12px]">
            <span className="text-white/40 font-mono truncate flex-1 max-w-[160px]">{entry.oldValue || "(none)"}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#3A2AEE] flex-shrink-0">
              <path d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-white/70 font-mono truncate flex-1 max-w-[160px]">{entry.newValue || "(none)"}</span>
            <span className="text-white/30 text-[10px] flex-shrink-0">
              {entry.changedAt ? new Date(entry.changedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}
            </span>
          </div>
        ))}
      </div>
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 w-full rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 font-sans text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          See more
        </button>
      )}
    </div>
  );
}

function ChatListSection({ title, chats }: { title: string; chats: ChatActivityEntry[] }) {
  if (chats.length === 0) return null;

  return (
    <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <h2 className="font-sans font-semibold text-[14px] text-white mb-4">{title}</h2>
      <div className="space-y-2">
        {chats.slice(0, 20).map((chat) => (
          <div key={chat.chatId} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="min-w-0">
              <p className="font-sans text-[13px] text-white truncate">{chat.chatName || chat.username || chat.chatId}</p>
              <p className="font-sans text-[10px] text-[#3A2AEE]">
                {chat.username ? `@${chat.username}` : chat.chatId}
              </p>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <p className="font-sans text-[12px] text-white/70">{chat.messageCount.toLocaleString()}</p>
              <p className="font-sans text-[9px] text-white/30">messages</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMessageDate(timestamp: string | null) {
  if (!timestamp) return "Unknown time";
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LastMessagesSection({
  response,
  isLoading,
}: {
  response: LookupMessagesResponse | undefined;
  isLoading: boolean;
}) {
  const messages: LookupMessage[] = response?.items ?? [];
  const unavailableReason = response?.unavailableReason;
  const lockedCopy = unavailableReason === "message_access_required"
    ? "Message history requires a Pro/Enterprise plan or the Message History add-on."
    : unavailableReason === "redacted"
      ? "Messages for this profile are redacted."
      : null;

  return (
    <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-sans font-semibold text-[14px] text-white">Last 10 Messages</h2>
        <span className="font-mono text-[10px] text-white/30">{messages.length}/10</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && lockedCopy && (
        <div className="rounded-[8px] border border-[#fbbf24]/20 bg-[#fbbf24]/[0.06] p-4">
          <p className="font-sans text-[12px] text-[#fbbf24]">{lockedCopy}</p>
        </div>
      )}

      {!isLoading && !lockedCopy && messages.length === 0 && (
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4">
          <p className="font-sans text-[12px] text-white/45">No recent messages found for this user.</p>
        </div>
      )}

      {!isLoading && !lockedCopy && messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((message) => (
            <Link
              key={`${message.chatId}-${message.messageId}`}
              to={message.contextLink}
              className="block rounded-[8px] border border-white/5 bg-white/[0.025] px-3 py-2.5 transition-colors hover:border-[#3A2AEE]/30 hover:bg-[#3A2AEE]/[0.07]"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-sans text-[12px] text-white/70">
                  {message.chat.title || message.chat.username || message.chatId}
                </p>
                <span className="shrink-0 font-sans text-[10px] text-white/30">
                  {formatMessageDate(message.timestamp)}
                </span>
              </div>
              <p className="line-clamp-2 font-sans text-[12px] leading-5 text-white/50">
                {message.content}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileLookup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: user, isLoading, error } = trpc.lookup.getUser.useQuery(
    { userId: id! },
    { enabled: !!id }
  );
  const { data: analytics } = trpc.analytics.getUserAnalytics.useQuery(
    { userId: id! },
    { enabled: !!id }
  );
  const { data: history } = trpc.lookup.getUserHistory.useQuery(
    { userId: id! },
    { enabled: !!id }
  );
  const { data: recentMessages, isLoading: recentMessagesLoading } = trpc.lookup.getUserMessages.useQuery(
    { userId: id!, limit: 10 },
    { enabled: !!id }
  );
  const { data: trackingState } = trpc.tracking.checkTracking.useQuery(
    { profileUserId: id! },
    { enabled: !!id }
  );

  const startTracking = trpc.tracking.startTracking.useMutation({
    onSuccess: async () => {
      toast.success("Profile tracking started");
      await Promise.all([
        utils.tracking.checkTracking.invalidate({ profileUserId: id! }),
        utils.tracking.list.invalidate(),
        utils.lookup.getUser.invalidate({ userId: id! }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const stopTracking = trpc.tracking.stopTracking.useMutation({
    onSuccess: async () => {
      toast.success("Profile tracking cancelled");
      await Promise.all([
        utils.tracking.checkTracking.invalidate({ profileUserId: id! }),
        utils.tracking.list.invalidate(),
        utils.lookup.getUser.invalidate({ userId: id! }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const userData = user as LookupUser | null;
  const analyticsData = analytics as UserAnalytics | undefined;
  const historyData = history as UserHistoryResponse | undefined;
  const currentTracking = (trackingState as { tracking?: TrackingRecord | null } | undefined)?.tracking ?? null;

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
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {(error || !userData) && !isLoading && (
            <div className="p-6 rounded-[12px]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="font-sans text-[14px] text-red-400">{error?.message || "Error loading profile"}</p>
            </div>
          )}

          {userData && !isLoading && (
            <div className="space-y-6">
              <div className="flex items-center gap-5">
                <div
                  className="w-[80px] h-[80px] rounded-[14px] overflow-hidden flex items-center justify-center"
                  style={{ background: "rgba(58,42,238,0.15)" }}
                >
                  {userData.profilePhoto ? (
                    <img
                      src={userData.profilePhoto}
                      alt={userData.displayName || userData.username || "User"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[#3A2AEE] text-[32px] font-bold">
                      {(userData.displayName || userData.username || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="font-sans font-semibold text-[28px] text-white">
                    {userData.displayName || userData.username || "Unknown User"}
                  </h1>
                  {userData.username && (
                    <p className="font-sans text-[14px] text-[#3A2AEE]">@{userData.username}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="font-sans text-[12px] text-[rgba(255,255,255,0.4)] font-mono">
                      ID: {userData.telegramUserId}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(58,42,238,0.2)] text-[#B8A8FF] uppercase">
                      {userData.premiumStatus ? "Telegram Premium" : "Standard"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.08)] text-white/70 uppercase">
                      {userData.trackingStatus || "Not tracked"}
                    </span>
                    {userData.redaction.applied && userData.redaction.type === "partial" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,74,74,0.12)] text-[#ff8a8a] uppercase">
                        Redacted
                      </span>
                    )}
                    {userData.isMasked && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.08)] text-white/60 uppercase">
                        Record unavailable
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!userData.isMasked && (
                <div
                  className="rounded-[10px] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                  style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}
                >
                  <div>
                    <p className="font-sans text-[10px] text-white/35 uppercase tracking-[0.08em]">Tracking</p>
                    <p className="font-sans text-[14px] text-white/80 mt-1">
                      {currentTracking
                        ? currentTracking.status === "paused"
                          ? "Paused due to insufficient credits. Auto-renews when you add credits."
                          : `Active. Next renewal ${new Date(currentTracking.next_renewal_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                        : "Track this profile to monitor identity changes and renewal status."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!currentTracking && (
                      <button
                        onClick={() => startTracking.mutate({
                          profileUserId: userData.telegramUserId,
                          profileUsername: userData.username ?? undefined,
                          profileDisplayName: userData.displayName ?? undefined,
                        })}
                        disabled={startTracking.isPending}
                        className="px-4 py-2 rounded-[10px] bg-[#3A2AEE] text-white font-sans text-[12px] hover:bg-[#4a3aff] transition-colors disabled:opacity-50"
                      >
                        {startTracking.isPending ? "Starting..." : "Track Profile"}
                      </button>
                    )}
                    {currentTracking && (
                      <>
                        <Link
                          to="/tracking"
                          className="px-4 py-2 rounded-[10px] bg-white/[0.04] border border-white/10 text-white/70 font-sans text-[12px] hover:bg-white/[0.08] transition-colors"
                        >
                          Open Tracking
                        </Link>
                        {currentTracking.status === "paused" && (
                          <button
                            onClick={() => navigate("/credits")}
                            className="px-4 py-2 rounded-[10px] bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#fbbf24] font-sans text-[12px] hover:bg-[#fbbf24]/15 transition-colors"
                          >
                            Add Credits
                          </button>
                        )}
                        <button
                          onClick={() => stopTracking.mutate({ trackingId: currentTracking.id })}
                          disabled={stopTracking.isPending}
                          className="px-4 py-2 rounded-[10px] bg-transparent border border-[#ff5d5d]/20 text-[#ff8a8a] font-sans text-[12px] hover:bg-[#ff5d5d]/5 transition-colors disabled:opacity-50"
                        >
                          {stopTracking.isPending ? "Cancelling..." : "Cancel Tracking"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {userData.bio && (
                <div className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.08)", border: "1px solid rgba(58,42,238,0.15)" }}>
                  <p className="font-sans text-[13px] text-white/70 whitespace-pre-wrap">{userData.bio}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SummaryCard label="First Seen" value={userData.firstSeen ? new Date(userData.firstSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"} />
                <SummaryCard label="Last Seen" value={userData.lastSeen ? new Date(userData.lastSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"} />
                <SummaryCard label="Active Chats" value={String(analyticsData?.activeChats.length ?? 0)} />
                <SummaryCard label="Words Indexed" value={String(analyticsData?.frequentWords.length ?? 0)} />
              </div>

              {analyticsData?.frequentWords && analyticsData.frequentWords.length > 0 && (
                <div className="rounded-[10px] p-5" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <h2 className="font-sans font-semibold text-[14px] text-white mb-4">Frequently Used Words</h2>
                  <div className="flex flex-wrap gap-2">
                    {analyticsData.frequentWords.slice(0, 50).map((word) => (
                      <span
                        key={word.word}
                        className="px-3 py-1 rounded-full text-[11px] font-medium"
                        style={{ background: "rgba(58,42,238,0.15)", color: "#B8A8FF" }}
                      >
                        {word.word} ({word.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {historyData && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <HistorySection title="Display Name History" entries={historyData.displayNameHistory} initialVisibleCount={5} />
                  <HistorySection title="Username History" entries={historyData.usernameHistory} />
                  <HistorySection title="Bio History" entries={historyData.bioHistory} initialVisibleCount={5} />
                  <HistorySection title="Phone History" entries={historyData.phoneHistory} />
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ChatListSection title="Active Chats" chats={analyticsData?.activeChats || []} />
                <ChatListSection title="Groups" chats={analyticsData?.groups || []} />
                <LastMessagesSection response={recentMessages as LookupMessagesResponse | undefined} isLoading={recentMessagesLoading} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ChatListSection title="Channels" chats={analyticsData?.channels || []} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

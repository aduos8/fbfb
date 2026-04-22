import { Link, useParams } from "react-router-dom";
import type { LookupChat } from "@shared/api";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
      <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-sans text-[14px] text-white/70">{value}</p>
    </div>
  );
}

export default function ChannelLookup() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = trpc.lookup.getChat.useQuery(
    { chatId: id! },
    { enabled: !!id }
  );

  const chatData = data as LookupChat | null;
  const subscriberCount = chatData?.subscriberCount ?? chatData?.participantCount ?? null;
  const showParticipantCount = chatData?.participantCount != null && chatData.participantCount !== subscriberCount;

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
            <ArrowLeft className="w-4 h-4" />
            Back to search
          </Link>
        </div>
        <div className="px-8 py-6">
          {isLoading && <p className="font-sans text-[14px] text-[rgba(255,255,255,0.5)]">Loading...</p>}
          {error && <p className="font-sans text-[14px] text-red-400">Error loading channel</p>}
          {chatData && (
            <div className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="w-[80px] h-[80px] rounded-[14px] overflow-hidden bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                  {chatData.profilePhoto ? (
                    <img
                      src={chatData.profilePhoto}
                      alt={chatData.title || "Channel"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[#3A2AEE] text-[32px] font-bold">
                      {(chatData.title || "C").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="font-sans font-semibold text-[28px] text-white">
                    {chatData.title || "Unknown Channel"}
                  </h1>
                  {chatData.username && (
                    <p className="font-sans text-[14px] text-[#3A2AEE]">@{chatData.username}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(58,42,238,0.2)] text-[#B8A8FF] uppercase">
                      {chatData.chatType || "channel"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.08)] text-white/70 uppercase">
                      {chatData.publicIndicator}
                    </span>
                    <span className="font-sans text-[12px] text-[rgba(255,255,255,0.4)] font-mono">
                      ID: {chatData.telegramChatId}
                    </span>
                  </div>
                </div>
              </div>

              {chatData.description && (
                <div className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.08)", border: "1px solid rgba(58,42,238,0.15)" }}>
                  <p className="font-sans text-[13px] text-white/70 whitespace-pre-wrap">{chatData.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Subscribers" value={subscriberCount != null ? subscriberCount.toLocaleString() : "Unavailable"} />
                {showParticipantCount && (
                  <StatCard label="Participants" value={chatData.participantCount!.toLocaleString()} />
                )}
                <StatCard label="Created" value={chatData.createdAt ? new Date(chatData.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"} />
                <StatCard label="Updated" value={chatData.updatedAt ? new Date(chatData.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

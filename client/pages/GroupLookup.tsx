import { useParams, Link } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';

export default function GroupLookup() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = trpc.lookup.getChat.useQuery(
    { chatId: id! },
    { enabled: !!id }
  );

  const chatData = data as { display_name?: string; username?: string; chat_id?: string; chat_type?: string; bio?: string; member_count?: number; participants_count?: number; avatar_url?: string; [key: string]: unknown } | null;

  const getAvatar = () => {
    if (chatData?.avatar_url) return chatData.avatar_url;
    return `https://i.pravatar.cc/150?u=${chatData?.chat_id || id}`;
  };

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
          {error && <p className="font-sans text-[14px] text-red-400">Error loading group</p>}
          {chatData && (
            <div className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="w-[80px] h-[80px] rounded-[14px] overflow-hidden bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                  {chatData.avatar_url ? (
                    <img
                      src={getAvatar()}
                      alt={chatData.display_name || "Group"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[#3A2AEE] text-[32px] font-bold">
                      {(chatData.display_name || 'G').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="font-sans font-semibold text-[28px] text-white">
                    {chatData.display_name || "Unknown Group"}
                  </h1>
                  {chatData.username && (
                    <p className="font-sans text-[14px] text-[#3A2AEE]">@{chatData.username}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(58,42,238,0.2)] text-[#B8A8FF] uppercase">
                      {chatData.chat_type?.replace('supergroup', 'super group') || "group"}
                    </span>
                    <span className="font-sans text-[12px] text-[rgba(255,255,255,0.4)] font-mono">
                      ID: {chatData.chat_id}
                    </span>
                  </div>
                </div>
              </div>

              {chatData.bio && (
                <div className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.08)", border: "1px solid rgba(58,42,238,0.15)" }}>
                  <p className="font-sans text-[13px] text-white/70 whitespace-pre-wrap">{chatData.bio as string}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Members</p>
                  <p className="font-sans text-[18px] text-white font-semibold">
                    {chatData.participants_count?.toLocaleString() || chatData.member_count?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Type</p>
                  <p className="font-sans text-[14px] text-white/70 capitalize">{chatData.chat_type?.replace('supergroup', 'super group') || "group"}</p>
                </div>
                <div className="rounded-[10px] p-4" style={{ background: "rgba(17,16,24,0.5)", border: "1px solid rgba(58,42,238,0.12)" }}>
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Created</p>
                  <p className="font-sans text-[14px] text-white/70">
                    {chatData.created_at
                      ? new Date(chatData.created_at as string).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

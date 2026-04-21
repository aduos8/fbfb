import { Link, useParams } from "react-router-dom";
import type { LookupMessage } from "@shared/api";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

function HighlightedMarkup({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MessageLookup() {
  const { chatId, messageId } = useParams<{ chatId: string; messageId: string }>();

  const { data, isLoading, error } = trpc.lookup.getMessage.useQuery(
    { chatId: chatId!, messageId: messageId! },
    { enabled: !!chatId && !!messageId }
  );

  const message = data as LookupMessage | null;

  return (
    <div className="min-h-screen bg-[#0F0F11]">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div className="px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-sans font-normal text-[12px] text-[rgba(255,255,255,0.6)] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to search
          </Link>
          {message?.chat.chatId && (
            <Link
              to={message.chat.type === "channel" ? `/lookup/channel/${message.chat.chatId}` : `/lookup/group/${message.chat.chatId}`}
              className="font-sans text-[12px] text-[#B8A8FF] hover:text-white transition-colors"
            >
              Open chat
            </Link>
          )}
        </div>

        <div className="px-8 py-6">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {(error || !message) && !isLoading && (
            <div className="p-6 rounded-[12px]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="font-sans text-[14px] text-red-400">{error?.message || "Message not found"}</p>
            </div>
          )}

          {message && !isLoading && (
            <div className="space-y-6">
              <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <span className="px-2 py-1 rounded text-[10px] font-medium bg-[rgba(58,42,238,0.2)] text-[#B8A8FF] uppercase">
                    {message.chat.type || "message"}
                  </span>
                  <span className="font-sans text-[12px] text-white/40 font-mono">Message ID: {message.messageId}</span>
                  <span className="font-sans text-[12px] text-white/40 font-mono">Chat ID: {message.chatId}</span>
                </div>

                <h1 className="font-sans font-semibold text-[24px] text-white mb-2">
                  {message.chat.title || message.chat.username || "Message Detail"}
                </h1>
                <div className="flex items-center gap-3 flex-wrap text-[12px] mb-5">
                  <span className="text-[#3A2AEE]">
                    {message.sender.username ? `@${message.sender.username}` : message.sender.displayName || message.sender.userId || "Unknown sender"}
                  </span>
                  {message.timestamp && (
                    <span className="text-white/40">{new Date(message.timestamp).toLocaleString()}</span>
                  )}
                  {message.redaction.applied && (
                    <span className="text-[#ff8a8a] uppercase text-[10px]">redacted</span>
                  )}
                </div>

                <div className="rounded-[10px] p-4 bg-[rgba(255,255,255,0.03)] border border-white/6 text-white/80 leading-relaxed">
                  <HighlightedMarkup html={message.highlightedSnippet || message.content} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card-border-gradient rounded-[20px] p-4">
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Sender</p>
                  <p className="font-sans text-[14px] text-white/70">{message.sender.displayName || message.sender.username || message.sender.userId || "Unknown"}</p>
                </div>
                <div className="card-border-gradient rounded-[20px] p-4">
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Has Media</p>
                  <p className="font-sans text-[14px] text-white/70">{message.hasMedia ? "Yes" : "No"}</p>
                </div>
                <div className="card-border-gradient rounded-[20px] p-4">
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Contains Links</p>
                  <p className="font-sans text-[14px] text-white/70">{message.containsLinks ? "Yes" : "No"}</p>
                </div>
                <div className="card-border-gradient rounded-[20px] p-4">
                  <p className="font-sans text-[10px] text-white/40 uppercase tracking-wider mb-1">Timestamp</p>
                  <p className="font-sans text-[14px] text-white/70">{message.timestamp ? new Date(message.timestamp).toLocaleString() : "Unknown"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

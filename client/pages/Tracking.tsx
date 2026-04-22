import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { Link } from "react-router-dom";
import type { TrackingEvent, TrackingRecord } from "@shared/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { RefreshCw, PauseCircle, Eye, ArrowRight, Coins } from "lucide-react";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyFieldName(field: TrackingEvent["field_name"]) {
  return field.replace(/_/g, " ");
}

export default function Tracking() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const navigate = useNavigate();

  const { data: trackingData, isLoading, refetch } = trpc.tracking.list.useQuery();
  const { data: historyData } = trpc.tracking.history.useQuery({ limit: 50 });

  const stopTracking = trpc.tracking.stopTracking.useMutation({
    onSuccess: async () => {
      toast.success("Tracking cancelled");
      await Promise.all([
        utils.tracking.list.invalidate(),
        utils.tracking.history.invalidate(),
        utils.lookup.getUser.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getUserFriendlyErrorMessage(error)),
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([headerRef.current, contentRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(headerRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.15)
        .to(contentRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.3);
    }, pageRef);

    return () => ctx.revert();
  }, []);

  const trackings = ((trackingData as { trackings?: TrackingRecord[] } | undefined)?.trackings ?? []) as TrackingRecord[];
  const history = ((historyData as { events?: TrackingEvent[] } | undefined)?.events ?? []) as TrackingEvent[];

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div className="px-6 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-8">
          <div ref={headerRef} style={{ filter: "blur(10px)", opacity: 0 }}>
            <p className="font-sans font-normal text-[11px] text-white/40 uppercase tracking-[0.08em] mb-2">
              Monitoring
            </p>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Profile <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">Tracking</span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3 max-w-[680px]">
              Monitor profile changes in real-time. Tracking renews automatically every 30 days when you have credits.
            </p>
          </div>

          <div ref={contentRef} className="flex flex-col gap-6" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Tracked Profiles</h2>
                  <p className="font-sans text-[12px] text-white/40 mt-1">
                    {trackings.length} active or paused monitor{trackings.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-transparent border border-white/10 text-white/60 font-sans text-[12px] hover:bg-white/5 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : trackings.length === 0 ? (
                <div className="rounded-[14px] border border-white/10 bg-white/[0.02] px-5 py-10 text-center">
                  <p className="font-sans text-[14px] text-white/65">No tracked profiles yet.</p>
                  <p className="font-sans text-[12px] text-white/35 mt-2">
                    Open a profile lookup page and use the track action to start monitoring.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {trackings.map((tracking) => (
                    <div
                      key={tracking.id}
                      className="rounded-[14px] border border-white/10 bg-white/[0.02] px-5 py-5 flex flex-col gap-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <p className="font-sans font-semibold text-[16px] text-white">
                            {tracking.profile_display_name || tracking.profile_username || tracking.profile_user_id}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            {tracking.profile_username && (
                              <span className="font-mono text-[12px] text-[#3A2AEE]">@{tracking.profile_username}</span>
                            )}
                            <span className="font-mono text-[11px] text-white/35">ID {tracking.profile_user_id}</span>
                            <span
                              className={`px-2 py-1 rounded-full text-[10px] uppercase font-medium ${
                                tracking.status === "active"
                                  ? "bg-[#05df72]/10 text-[#05df72]"
                                  : "bg-[#ffb84d]/10 text-[#ffb84d]"
                              }`}
                            >
                              {tracking.status}
                            </span>
                            {tracking.status === "paused" && (
                              <span className="text-[11px] text-white/40">
                                Auto-renews when credits available
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/lookup/profile/${tracking.profile_user_id}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/[0.04] border border-white/10 text-white/70 font-sans text-[12px] hover:bg-white/[0.08] transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            Open Profile
                          </Link>
                          {tracking.status === "paused" && (
                            <button
                              onClick={() => navigate("/credits")}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-[#fbbf24] font-sans text-[12px] hover:bg-[#fbbf24]/15 transition-colors"
                            >
                              <Coins className="w-4 h-4" />
                              Add Credits
                            </button>
                          )}
                          <button
                            onClick={() => stopTracking.mutate({ trackingId: tracking.id })}
                            disabled={stopTracking.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-transparent border border-[#ff5d5d]/20 text-[#ff8a8a] font-sans text-[12px] hover:bg-[#ff5d5d]/5 transition-colors disabled:opacity-50"
                          >
                            <PauseCircle className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="rounded-[12px] bg-[#111018] border border-white/5 px-4 py-3">
                          <p className="font-sans text-[10px] text-white/35 uppercase tracking-[0.08em]">Started</p>
                          <p className="font-sans text-[13px] text-white/70 mt-1">{formatDate(tracking.created_at)}</p>
                        </div>
                        <div className="rounded-[12px] bg-[#111018] border border-white/5 px-4 py-3">
                          <p className="font-sans text-[10px] text-white/35 uppercase tracking-[0.08em]">Last Renewal</p>
                          <p className="font-sans text-[13px] text-white/70 mt-1">{formatDate(tracking.last_renewal_at)}</p>
                        </div>
                        <div className="rounded-[12px] bg-[#111018] border border-white/5 px-4 py-3">
                          <p className="font-sans text-[10px] text-white/35 uppercase tracking-[0.08em]">Next Renewal</p>
                          <p className="font-sans text-[13px] text-white/70 mt-1">{formatDate(tracking.next_renewal_at)}</p>
                        </div>
                        <div className="rounded-[12px] bg-[#111018] border border-white/5 px-4 py-3">
                          <p className="font-sans text-[10px] text-white/35 uppercase tracking-[0.08em]">Last Detected Change</p>
                          <p className="font-sans text-[13px] text-white/70 mt-1">{formatDate(tracking.last_detected_change_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Recent Change History</h2>
                  <p className="font-sans text-[12px] text-white/40 mt-1">Latest tracking events across all monitored profiles</p>
                </div>
                <ArrowRight className="w-4 h-4 text-white/25" />
              </div>

              {history.length === 0 ? (
                <div className="rounded-[14px] border border-white/10 bg-white/[0.02] px-5 py-8 text-center">
                  <p className="font-sans text-[13px] text-white/55">No change events detected yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[14px] border border-white/10 bg-white/[0.02] px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="font-sans text-[13px] text-white/75">
                          <span className="text-[#3A2AEE]">{event.profile_username ? `@${event.profile_username}` : event.profile_user_id}</span>{" "}
                          updated <span className="capitalize">{prettyFieldName(event.field_name)}</span>
                        </p>
                        <p className="font-sans text-[12px] text-white/40 mt-1">
                          {event.old_value ?? "(none)"} → {event.new_value ?? "(none)"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[11px] text-white/35">{formatDate(event.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

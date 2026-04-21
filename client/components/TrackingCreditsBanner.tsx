import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth";
import { X, Coins, AlertTriangle } from "lucide-react";
import type { TrackingRecord } from "@shared/api";

interface PausedTrackingsResponse {
  trackings: TrackingRecord[];
}

export default function TrackingCreditsBanner() {
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const authed = isAuthenticated();

  const { data: pausedData } = trpc.tracking.getPausedTrackings.useQuery(
    undefined,
    {
      enabled: authed && !dismissed,
      refetchInterval: 30000,
    }
  );

  const pausedTrackings = (pausedData as PausedTrackingsResponse | undefined)?.trackings ?? [];
  const hasPausedTrackings = pausedTrackings.length > 0;
  const shouldShow = authed && !dismissed && hasPausedTrackings;

  useEffect(() => {
    if (!bannerRef.current) return;

    if (shouldShow) {
      gsap.fromTo(
        bannerRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }
      );
    } else {
      if (bannerRef.current.style.opacity !== "0") {
        gsap.to(bannerRef.current, {
          y: -100,
          opacity: 0,
          duration: 0.3,
          ease: "power3.in",
        });
      }
    }
  }, [shouldShow]);

  const handleDismiss = () => {
    setDismissed(true);
    if (bannerRef.current) {
      gsap.to(bannerRef.current, {
        y: -100,
        opacity: 0,
        duration: 0.3,
        ease: "power3.in",
      });
    }
  };

  const handleAddCredits = () => {
    navigate("/credits");
  };

  if (!shouldShow) {
    return null;
  }

  const profileNames = pausedTrackings
    .slice(0, 2)
    .map((t) => t.profile_username ? `@${t.profile_username}` : t.id)
    .join(", ");

  const moreCount = pausedTrackings.length > 2 ? pausedTrackings.length - 2 : 0;

  return (
    <div
      ref={bannerRef}
      className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
      style={{ transform: "translateY(-100px)", opacity: 0 }}
    >
      <div className="bg-[#1a1a1f] border-b border-[rgba(239,68,68,0.3)] shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Coins className="w-4 h-4 text-[#fbbf24] shrink-0" />
                <p className="font-sans text-[13px] text-white/90 truncate">
                  <span className="font-medium">Profile monitors paused</span>
                  <span className="text-white/60">
                    {" "}due to insufficient credits
                  </span>
                </p>
                {profileNames && (
                  <p className="font-mono text-[11px] text-white/40 hidden sm:block truncate">
                    {profileNames}
                    {moreCount > 0 && ` +${moreCount} more`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleAddCredits}
                className="px-4 py-1.5 rounded-[6px] bg-[#3A2AEE] text-white font-sans text-[12px] font-medium hover:bg-[#4a3aff] transition-colors pointer-events-auto"
              >
                Add Credits
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-[6px] hover:bg-white/5 transition-colors pointer-events-auto"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

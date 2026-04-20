import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Coins, ArrowRight } from "lucide-react";

const ADD_ONS = [
  {
    id: "data-unlock-profile",
    category: "DATA",
    categoryColor: "#d4a855",
    categoryBg: "rgba(37, 31, 20, 0.8)",
    title: "Data Unlock",
    subtitle: "Profile Full Access",
    description: "Access complete profile data including hidden fields",
    credits: 25,
    features: [
      "Complete profile metadata",
      "Identity history records",
      "Chat membership data",
      "Last seen timestamps",
      "Raw data export",
    ],
  },
  {
    id: "data-unlock-messages",
    category: "DATA",
    categoryColor: "#d4a855",
    categoryBg: "rgba(37, 31, 20, 0.8)",
    title: "Data Unlock",
    subtitle: "Message History Export",
    description: "Export message history as structured JSON",
    credits: 40,
    features: [
      "Full message thread history",
      "Media and file references",
      "User interaction graph",
      "Structured JSON output",
      "Date range filters",
    ],
  },
  {
    id: "analytics-crossref",
    category: "ANALYTICS",
    categoryColor: "#78a7d9",
    categoryBg: "rgba(21, 30, 40, 0.8)",
    title: "Analytics",
    subtitle: "Cross-Reference Analysis",
    description: "Map connections between entities",
    credits: 30,
    features: [
      "Entity connection mapping",
      "Shared group analysis",
      "Username overlap detection",
      "Time-correlated activity",
      "Visual relationship graph",
    ],
  },
  {
    id: "analytics-heatmap",
    category: "ANALYTICS",
    categoryColor: "#78a7d9",
    categoryBg: "rgba(21, 30, 40, 0.8)",
    title: "Analytics",
    subtitle: "Activity Heatmap",
    description: "Visual activity patterns over time",
    credits: 20,
    features: [
      "Hourly activity breakdown",
      "Day-of-week patterns",
      "Weekly/monthly trends",
      "Engagement intensity map",
      "Exportable chart data",
    ],
  },
  {
    id: "tracking-monitor",
    category: "TRACKING",
    categoryColor: "#c49a7a",
    categoryBg: "rgba(196, 154, 122, 0.1)",
    title: "Tracking",
    subtitle: "Profile Monitor Pack",
    description: "Monitor 5 profiles for 30 days",
    credits: 45,
    features: [
      "Monitor 5 profiles",
      "30-day active tracking",
      "Username change alerts",
      "Bio and photo changes",
      "Auto-renew on credit",
    ],
  },
  {
    id: "export-csv",
    category: "EXPORT",
    categoryColor: "#82b892",
    categoryBg: "rgba(130, 184, 146, 0.1)",
    title: "Export",
    subtitle: "CSV Bulk Export",
    description: "Export search results to CSV format",
    credits: 15,
    features: [
      "Bulk result export",
      "Custom column selection",
      "Append to existing file",
      "Scheduled exports",
      "Up to 10,000 rows",
    ],
  },
  {
    id: "premium-filters",
    category: "PREMIUM",
    categoryColor: "#b07acc",
    categoryBg: "rgba(176, 122, 204, 0.1)",
    title: "Premium",
    subtitle: "Advanced Search Filters",
    description: "Access extended search parameters",
    credits: 15,
    features: [
      "Boolean query builder",
      "Date range restrictions",
      "Media-only filters",
      "Language detection",
      "Result deduplication",
    ],
  },
  {
    id: "export-pdf",
    category: "EXPORT",
    categoryColor: "#82b892",
    categoryBg: "rgba(130, 184, 146, 0.1)",
    title: "Export",
    subtitle: "PDF Report",
    description: "Generate formatted intelligence report",
    credits: 35,
    features: [
      "Formatted intelligence brief",
      "Executive summary page",
      "Full data appendix",
      "Branded report header",
      "Shareable secure link",
    ],
  },
];

export default function Purchases() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const browseTabRef = useRef<HTMLButtonElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"browse" | "history">("browse");
  const { data: balance } = trpc.account.getBalance.useQuery();
  const { data: purchases } = trpc.purchases.list.useQuery();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const createPurchaseMutation = trpc.purchases.createPurchase.useMutation({
    onSuccess: (data) => {
      setPurchasing(null);
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.success("Add-on purchased!");
      }
    },
    onError: (e) => {
      toast.error(e.message || "Purchase failed");
      setPurchasing(null);
    },
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(titleRef.current, { filter: "blur(8px)", opacity: 0, y: 24 });
      gsap.set(subtitleRef.current, { filter: "blur(6px)", opacity: 0, y: 16 });
      gsap.set(browseTabRef.current, { filter: "blur(6px)", opacity: 0, y: 12 });
      gsap.set(".addon-card", { filter: "blur(10px)", opacity: 0, y: 30 });

      gsap.to(titleRef.current, {
        filter: "blur(0px)",
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        delay: 0.15,
      });
      gsap.to(subtitleRef.current, {
        filter: "blur(0px)",
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        delay: 0.3,
      });
      gsap.to(browseTabRef.current, {
        filter: "blur(0px)",
        opacity: 1,
        y: 0,
        duration: 0.55,
        ease: "power3.out",
        delay: 0.4,
      });
      gsap.to(".addon-card", {
        filter: "blur(0px)",
        opacity: 1,
        y: 0,
        duration: 0.65,
        ease: "power3.out",
        stagger: 0.08,
        delay: 0.5,
      });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const handlePurchase = (addon: (typeof ADD_ONS)[0]) => {
    const currentBalance = balance?.credits ?? 0;
    if (currentBalance < addon.credits) {
      toast.error(`Not enough credits. You have ${currentBalance}, need ${addon.credits}.`);
      return;
    }
    setPurchasing(addon.id);
    createPurchaseMutation.mutate({
      credits: addon.credits,
      price_cents: addon.credits * 100,
    });
  };

  const purchaseList = (purchases?.purchases || []) as any[];

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-bl-[40px] md:rounded-bl-[50px] overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(15,15,17,0.60) 0%, rgba(58,42,238,0.12) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div ref={contentRef} className="px-6 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-12 flex flex-col gap-6">
          <div className="relative">
            <div ref={titleRef} className="mb-1" style={{ filter: "blur(8px)", opacity: 0 }}>
              <h1 className="font-['Plus_Jakarta_Sans'] font-bold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
                Add<span className="font-['Shadows_Into_Light'] text-[#3a2aee] not-italic">-Ons</span>
              </h1>
            </div>
            <p
              ref={subtitleRef}
              className="font-['Plus_Jakarta_Sans'] font-normal text-[15px] text-white/40 mt-3"
              style={{ filter: "blur(6px)", opacity: 0 }}
            >
              Intelligence add-ons and premium data access
            </p>
          </div>

          <div className="flex items-center gap-6 sm:gap-10 pt-2">
            <button
              ref={browseTabRef}
              onClick={() => setActiveTab("browse")}
              className={`font-['Plus_Jakarta_Sans'] font-normal text-[15px] transition-all duration-200 relative pb-1 ${
                activeTab === "browse" ? "text-white" : "text-white/40 hover:text-white/60"
              }`}
              style={{ filter: "blur(6px)", opacity: 0 }}
            >
              BROWSE
              {activeTab === "browse" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white"
                  style={{ filter: "blur(0px)", opacity: 1 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`font-['Plus_Jakarta_Sans'] font-normal text-[15px] transition-all duration-200 relative pb-1 ${
                activeTab === "history" ? "text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              HISTORY
              {activeTab === "history" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white" />
              )}
            </button>
            <div className="flex-1 h-px bg-white/10 mt-3" />
          </div>

          {activeTab === "browse" ? (
            <div
              ref={cardsRef}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pt-2"
            >
              {ADD_ONS.map((addon) => (
                <div
                  key={addon.id}
                  className="addon-card rounded-[10px] p-5 flex flex-col"
                  style={{
                    background: "rgba(17,16,24,0.5)",
                    border: "1px solid rgba(58,42,238,0.2)",
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="px-2.5 flex items-center justify-center rounded-[2px] h-[16px]"
                      style={{
                        background: addon.categoryBg,
                        border: `0.5px solid ${addon.categoryColor}`,
                        backdropFilter: "blur(16px)",
                      }}
                    >
                      <span
                        className="font-['Plus_Jakarta_Sans'] font-normal text-[8px] tracking-wide leading-none"
                        style={{ color: addon.categoryColor }}
                      >
                        {addon.category}
                      </span>
                    </div>
                  </div>

                  <div className="mb-2">
                    <h3 className="font-['Plus_Jakarta_Sans'] font-semibold text-white text-[15px]">
                      {addon.title}
                    </h3>
                    <p className="font-['Plus_Jakarta_Sans'] font-normal text-[12px] text-white/50 mt-0.5">
                      {addon.subtitle}
                    </p>
                    <p className="font-['Plus_Jakarta_Sans'] font-normal text-[10px] text-white/20 mt-1 leading-snug">
                      {addon.description}
                    </p>
                  </div>

                  <div className="h-px bg-white/10 my-4" />

                  <div className="flex-1">
                    <ul className="space-y-2.5 sm:space-y-3">
                      {addon.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 font-['Plus_Jakarta_Sans'] font-normal text-[10px] text-white/50"
                        >
                          <span
                            className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                            style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="h-px bg-white/10 mt-4 mb-4" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-['Plus_Jakarta_Sans'] font-semibold text-[20px] text-white">
                        {addon.credits}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-['Plus_Jakarta_Sans'] font-normal text-[7px] text-white/40 uppercase">
                          credits
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handlePurchase(addon)}
                      disabled={purchasing === addon.id || createPurchaseMutation.isPending}
                      className="flex items-center gap-2 h-[30px] px-4 rounded-[6px] bg-[#3A2AEE] font-['Plus_Jakarta_Sans'] font-normal text-[10px] text-white transition-all duration-200 hover:bg-[#4f48ff] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
                    >
                      Get Add-On
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-2">
              <h3 className="font-['Plus_Jakarta_Sans'] font-semibold text-white text-[14px] mb-4">
                Purchase History
              </h3>
              {purchaseList.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {purchaseList.map((p: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-[10px] p-4 flex items-center justify-between"
                      style={{
                        background: "rgba(17,16,24,0.5)",
                        border: "1px solid rgba(58,42,238,0.2)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-[8px] flex items-center justify-center"
                          style={{
                            background: "rgba(58,42,238,0.12)",
                            border: "1px solid rgba(58,42,238,0.3)",
                          }}
                        >
                          <Coins className="w-5 h-5 text-white/50" />
                        </div>
                        <div>
                          <p className="font-['Plus_Jakarta_Sans'] font-medium text-[13px] text-white">
                            {p.item_name || "Add-On Purchase"}
                          </p>
                          <p className="font-['Plus_Jakarta_Sans'] font-normal text-[11px] text-white/30 mt-0.5">
                            {p.purchased_at
                              ? new Date(p.purchased_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-white/50">
                          -{p.credit_cost || p.creditCost || 0}
                        </span>
                        <span className="font-['Plus_Jakarta_Sans'] font-normal text-[9px] text-white/30">
                          cr
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-[10px] p-12 text-center"
                  style={{
                    background: "rgba(17,16,24,0.5)",
                    border: "1px solid rgba(58,42,238,0.2)",
                  }}
                >
                  <Coins className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="font-['Plus_Jakarta_Sans'] font-normal text-[13px] text-white/30">
                    No purchase history yet
                  </p>
                  <p className="font-['Plus_Jakarta_Sans'] font-normal text-[11px] text-white/20 mt-1">
                    Browse add-ons above to get started
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

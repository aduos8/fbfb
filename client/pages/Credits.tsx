import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Coins, ArrowUpRight, Plus, ShoppingBag, CreditCard, User, Gift, ChevronDown, X } from "lucide-react";

const transactionTypeConfig: Record<string, {
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}> = {
  subscription: {
    label: "SUBSCRIPTION",
    color: "#78a7d9",
    icon: CreditCard,
  },
  subscription_credit: {
    label: "SUBSCRIPTION",
    color: "#78a7d9",
    icon: CreditCard,
  },
  credit_deducted: {
    label: "CREDIT DEDUCTED",
    color: "#ff4a4a",
    icon: ArrowUpRight,
  },
  admin_adjustment: {
    label: "ADMIN ADJUSTMENT",
    color: "#8080b8",
    icon: User,
  },
  voucher_redemption: {
    label: "VOUCHER REDEMPTION",
    color: "#05df72",
    icon: Gift,
  },
  purchase: {
    label: "PURCHASE",
    color: "#05df72",
    icon: CreditCard,
  },
  credit_added: {
    label: "CREDIT ADDED",
    color: "#05df72",
    icon: Plus,
  },
};

function getTransactionConfig(txn: any) {
  const amount = Number(txn.amount || 0);
  const typeKey = txn.transaction_type || "";
  const known = transactionTypeConfig[typeKey];

  if (known) return known;

  if (amount > 0) {
    return transactionTypeConfig.credit_added;
  }

  return transactionTypeConfig.credit_deducted;
}

function getCompactTypeLabel(txn: any): string {
  const typeKey = txn.transaction_type || "";
  const amount = Number(txn.amount || 0);

  if (typeKey === "credit_deducted" || amount < 0) return "DEBIT";
  if (typeKey === "voucher_redemption") return "REDEEM";
  if (typeKey === "subscription_credit") return "SUB";
  if (typeKey === "purchase") return "BUY";
  if (typeKey === "admin_adjustment") return amount >= 0 ? "ADD" : "DEBIT";
  if (amount > 0) return "ADD";
  return "DEBIT";
}

function getFriendlyDescription(txn: any): string {
  const type = txn.transaction_type || "";
  const notes = txn.notes || "";
  const reference = txn.reference || "";

  if (notes) {
    try {
      const parsed = JSON.parse(notes);
      if (parsed.searchType || parsed.type) {
        const searchType = (parsed.searchType || parsed.type || "").toLowerCase();
        const query = parsed.query || parsed.username || parsed.channelId || parsed.groupId || "";

        const typeLabels: Record<string, string> = {
          profile: "Profile",
          username: "Username",
          email: "Email",
          phone: "Phone",
          channel: "Channel",
          group: "Group",
          message: "Message",
          instagram: "Instagram",
          tiktok: "TikTok",
        };

        const label = typeLabels[searchType] || searchType.charAt(0).toUpperCase() + searchType.slice(1);
        return query ? `${label} search: "${query}"` : `${label} search`;
      }

      if (parsed.reason) return parsed.reason;
      if (parsed.description) return parsed.description;
    } catch {
      // Not JSON, return as-is
    }
    return notes;
  }

  switch (type) {
    case "subscription":
      return "Monthly subscription renewal";
    case "subscription_credit":
      return "Subscription credits added";
    case "voucher_redemption":
      return reference ? `Voucher code: ${reference}` : "Voucher redeemed";
    case "credit_deducted":
      if (reference?.startsWith("search:")) {
        return "Search query";
      }
      if (reference?.startsWith("USR-")) return "Profile lookup";
      if (reference?.startsWith("GRP-")) return "Group lookup";
      if (reference?.startsWith("CH-")) return "Channel analytics";
      if (reference?.startsWith("MSG-")) return "Message search";
      if (reference?.startsWith("API-")) return "API usage";
      return "Service usage";
    case "admin_adjustment":
      return reference ? `Admin adjustment: ${reference}` : "Balance adjusted by admin";
    case "purchase":
      return "Credits purchased";
    case "refund":
      return "Refund processed";
    default:
      if (type.includes("lookup")) return "Data lookup";
      if (type.includes("search")) return "Search query";
      if (type.includes("api")) return "API usage";
      return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

const PAGE_SIZE = 10;

export default function Credits() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const balanceCardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [showTopUp, setShowTopUp] = useState(false);
  const [purchasingPkg, setPurchasingPkg] = useState<string | null>(null);

  const { data: balanceData } = trpc.credits.getBalance.useQuery();
  const { data: transactionsData, isFetching } = trpc.credits.listTransactions.useQuery({
    limit: 100,
    offset: 0,
  });
  const { data: packages } = trpc.purchases.getPackages.useQuery();

  const createPurchase = trpc.purchases.createPurchase.useMutation({
    onSuccess: (data) => {
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.success("Credits added!");
      }
      setShowTopUp(false);
      setPurchasingPkg(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setPurchasingPkg(null);
    },
  });

  const currentBalance = balanceData?.balance ?? 0;
  const creditLimit = balanceData?.credit_limit ?? 5000;
  const progressPercent = (currentBalance / creditLimit) * 100;

  const allTransactions = (transactionsData?.transactions ?? []) as any[];
  const displayedTransactions = allTransactions.slice(0, displayCount);
  const totalTransactions = transactionsData?.total ?? allTransactions.length;
  const hasMore = displayCount < totalTransactions;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([titleRef.current, balanceCardRef.current, tableRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(titleRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.2)
        .to(balanceCardRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.35)
        .to(tableRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.5);
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const handleTopUp = () => {
    setShowTopUp(true);
  };

  const handleBuyCredits = (pkg: any) => {
    setPurchasingPkg(`${pkg.credits}`);
    createPurchase.mutate({ credits: pkg.credits, price_cents: pkg.price_cents });
  };

  const handleBrowseItems = () => {
    toast.success("Opening marketplace...");
  };

  const handleShowMore = () => {
    gsap.to(tableRef.current, { opacity: 0.5, duration: 0.15 });
    setTimeout(() => {
      setDisplayCount((prev) => prev + PAGE_SIZE);
      gsap.to(tableRef.current, { opacity: 1, duration: 0.2 });
    }, 150);
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0f0f11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div ref={contentRef} className="px-6 sm:px-10 lg:px-14 xl:px-20 pt-6 md:pt-8 pb-10 md:pb-14 flex flex-col gap-8">
          <div ref={titleRef} style={{ filter: "blur(10px)", opacity: 0 }}>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Credits <span className="font-handwriting text-[#3a2aee] text-[32px] sm:text-[36px] md:text-[40px]">Ledger</span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3">
              Transaction history and balance
            </p>
          </div>

          <div ref={balanceCardRef} className="flex flex-col gap-6" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="rounded-[15px] p-6 md:p-8 relative overflow-hidden" style={{ background: "#111018", border: "1.5px solid rgba(58,42,238,0)" }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex flex-col gap-1">
                  <span className="font-sans font-normal text-[11px] sm:text-[12px] text-white/70 uppercase tracking-[0.06em]">
                    Available balance
                  </span>
                  <span className="font-sans font-semibold text-[72px] sm:text-[80px] md:text-[100px] text-white leading-none tracking-tight">
                    {currentBalance.toLocaleString()}
                  </span>
                  <span className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/70 lowercase">
                    credits
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTopUp}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#3a2aee] font-sans font-normal text-[12px] sm:text-[13px] md:text-[14px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                  >
                    <Plus className="w-4 h-4" />
                    Top up
                  </button>
                  <button
                    onClick={handleBrowseItems}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[12px] sm:text-[13px] md:text-[14px] text-white hover:bg-white/5 transition-colors cursor-pointer border border-white/20"
                  >
                    <ShoppingBag className="w-4 h-4 opacity-50" />
                    Browse Items
                  </button>
                </div>
              </div>

              <div className="mt-8 md:mt-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-normal text-[11px] sm:text-[12px] text-white/20 lowercase">
                    {currentBalance}
                  </span>
                  <span className="font-mono font-normal text-[11px] sm:text-[12px] text-white/20 uppercase text-right">
                    Limit: {creditLimit.toLocaleString()}
                  </span>
                </div>
                <div className="h-0 relative">
                  <div className="absolute inset-0 h-[2px] top-[-1px]">
                    <div className="w-full h-full bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white/20 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[15px] overflow-hidden" style={{ background: "#111018", border: "1.5px solid rgba(58,42,238,0)" }}>
              <div className="px-6 md:px-8 py-5 md:py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="grid grid-cols-4 gap-4 md:gap-8 w-full">
                  <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/50 uppercase tracking-wide">
                    Date
                  </span>
                  <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/50 uppercase tracking-wide">
                    Type
                  </span>
                  <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/50 uppercase tracking-wide col-span-1 md:col-span-1">
                    Description
                  </span>
                  <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/50 uppercase tracking-wide text-right">
                    Amount
                  </span>
                </div>
              </div>

              <div ref={tableRef}>
                {displayedTransactions.length > 0 ? (
                  <>
                    {displayedTransactions.map((txn, index) => {
                      const typeKey = txn.transaction_type || "";
                      const config = getTransactionConfig(txn);
                      const IconComponent = config.icon;
                      const isPositive = (txn.amount as number) > 0;
                      const date = txn.created_at
                        ? new Date(txn.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "";
                      const description = getFriendlyDescription(txn);

                      return (
                        <div
                          key={txn.id || index}
                          className="group"
                          style={{
                            borderBottom: index < displayedTransactions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}
                        >
                          <div className="px-6 md:px-8 py-4 md:py-5 hover:bg-white/[0.02] transition-colors">
                            <div className="grid grid-cols-4 gap-4 md:gap-8 items-center">
                              <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/20">
                                {date}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 flex items-center justify-center">
                                  <IconComponent className="w-3.5 h-3.5" style={{ color: config.color }} />
                                </div>
                                <span
                                  className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] hidden sm:inline"
                                  style={{ color: config.color }}
                                >
                                  {config.label}
                                </span>
                                <span
                                  className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] sm:hidden"
                                  style={{ color: config.color }}
                                >
                                  {getCompactTypeLabel(txn)}
                                </span>
                              </div>
                              <span className="font-sans font-normal text-[12px] sm:text-[13px] md:text-[15px] text-white/90 truncate">
                                {description}
                              </span>
                              <span
                                className={`font-mono font-medium text-[12px] sm:text-[13px] md:text-[15px] text-right ${isPositive ? "text-[#05df72]" : "text-[#ff4a4a]"}`}
                              >
                                {isPositive ? "+" : ""}{txn.amount}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {hasMore && (
                      <div className="px-6 md:px-8 py-5 flex items-center justify-center" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <button
                          onClick={handleShowMore}
                          disabled={isFetching}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] bg-transparent font-sans font-normal text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-all cursor-pointer border border-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isFetching ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Show more ({allTransactions.length - displayCount} remaining)
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-6 md:px-8 py-12 text-center">
                    <Coins className="w-8 h-8 text-white/15 mx-auto mb-3" />
                    <p className="font-sans font-normal text-[13px] text-white/40">No transactions yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTopUp && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTopUp(false); }}
        >
          <div
            className="w-full max-w-2xl rounded-[24px] overflow-hidden"
            style={{ background: "rgba(17,16,24,0.98)", border: "1px solid rgba(58,42,238,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h2 className="font-sans font-semibold text-white text-[20px]">Top Up Credits</h2>
                <p className="font-sans text-[12px] text-white/40 mt-1">Select a package to purchase</p>
              </div>
              <button
                onClick={() => setShowTopUp(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {(packages || []).map((pkg: any) => {
                  const isPurchasing = purchasingPkg === `${pkg.credits}`;
                  return (
                    <button
                      key={pkg.credits}
                      onClick={() => handleBuyCredits(pkg)}
                      disabled={isPurchasing}
                      className="rounded-[12px] p-5 text-center transition-all cursor-pointer border-0"
                      style={{
                        background: isPurchasing ? "rgba(58,42,238,0.3)" : "rgba(58,42,238,0.12)",
                        border: "1px solid rgba(58,42,238,0.2)",
                      }}
                    >
                      {isPurchasing ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2" />
                      ) : (
                        <div className="font-sans font-bold text-white text-[24px] mb-1">
                          {pkg.credits}
                        </div>
                      )}
                      <div className="font-sans font-normal text-[11px] text-white/40 mb-2">credits</div>
                      <div className="font-sans font-semibold text-[#3A2AEE] text-[15px]">
                        ${(pkg.price_cents / 100).toFixed(0)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="p-4 rounded-[12px]" style={{ background: "rgba(58,42,238,0.06)", border: "1px solid rgba(58,42,238,0.1)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[8px] bg-[#3A2AEE]/20 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#3A2AEE]">
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="font-sans text-[12px] text-white/60 leading-relaxed">
                    Payment processed securely via Oxapay. Supports BTC, ETH, USDT and other cryptocurrencies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="flex-1 bg-[#0f0f11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

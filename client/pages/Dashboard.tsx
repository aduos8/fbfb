import { useRef, useEffect } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { Link } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CreditCard, Search, ShoppingBag, Settings2, Activity } from "lucide-react";

export default function Dashboard() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: profile } = trpc.account.getProfile.useQuery();
  const { data: balance } = trpc.account.getBalance.useQuery();
  const { data: summary } = trpc.credits.getSummary.useQuery();
  const { data: recentTransactions } = trpc.credits.getTransactions.useQuery({ limit: 5 });

  const profileData = profile?.profile as any;
  const txns = (recentTransactions?.transactions || []) as any[];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([headerRef.current, contentRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(headerRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.2)
        .to(contentRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.35);
    }, pageRef);
    return () => ctx.revert();
  }, []);

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
            <p className="font-sans font-normal text-[11px] text-white/40 uppercase tracking-[0.1em] mb-2">
              Account Overview
            </p>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Welcome <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">back</span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3">
              {profileData?.username || profileData?.email?.split("@")[0] || "User"} {profileData?.email && `· ${profileData.email}`}
            </p>
          </div>

          <div ref={contentRef} className="flex flex-col gap-6" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Credits</span>
                  <span className="font-sans font-bold text-white text-[28px]">{balance?.credits?.toLocaleString() ?? "—"}</span>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Earned</span>
                  <span className="font-sans font-bold text-white text-[28px]">{summary?.total_credits_earned?.toLocaleString() ?? "—"}</span>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Searches</span>
                  <span className="font-sans font-bold text-white text-[28px]">{summary?.total_transactions?.toLocaleString() ?? "—"}</span>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Tracked</span>
                  <span className="font-sans font-bold text-white text-[28px]">0</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Recent Activity</h2>
                  <Link to="/credits" className="font-sans font-normal text-[11px] text-[#3A2AEE] hover:text-[#6B5BFF] transition-colors">
                    View all
                  </Link>
                </div>
                {txns.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {txns.map((txn: any, i: number) => {
                      const isPositive = txn.amount > 0;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between py-3"
                          style={{ borderBottom: i < txns.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-sans font-normal text-[12px] md:text-[13px] text-white/70 capitalize">
                              {txn.transaction_type?.replace(/_/g, " ") || "Transaction"}
                            </span>
                            <span className="font-sans font-normal text-[10px] text-white/30">
                              {txn.created_at ? new Date(txn.created_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }) : "—"}
                            </span>
                          </div>
                          <span className={`font-mono font-medium text-[13px] md:text-[14px] ${txn.amount > 0 ? "text-[#05df72]" : "text-[#ff4a4a]"}`}>
                            {txn.amount > 0 ? "+" : ""}{txn.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="font-sans font-normal text-[13px] text-white/40">No recent activity</p>
                  </div>
                )}
              </div>

              <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
                <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Quick Actions</h2>
                <div className="flex flex-col gap-3">
                  <Link
                    to="/"
                    className="flex items-center gap-4 p-4 rounded-[12px] group transition-all duration-200 hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
                  >
                    <Search className="w-5 h-5 text-[#3A2AEE]" />
                    <div className="flex-1">
                      <span className="font-sans font-medium text-[13px] md:text-[14px] text-white">Search Profiles</span>
                      <p className="font-sans font-normal text-[11px] text-white/40">Look up usernames, IDs, and more</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-[#3A2AEE] transition-colors" />
                  </Link>
                  <Link
                    to="/credits"
                    className="flex items-center gap-4 p-4 rounded-[12px] group transition-all duration-200 hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
                  >
                    <CreditCard className="w-5 h-5 text-[#3A2AEE]" />
                    <div className="flex-1">
                      <span className="font-sans font-medium text-[13px] md:text-[14px] text-white">Credits</span>
                      <p className="font-sans font-normal text-[11px] text-white/40">Top up or view transactions</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-[#3A2AEE] transition-colors" />
                  </Link>
                  <Link
                    to="/account-settings"
                    className="flex items-center gap-4 p-4 rounded-[12px] group transition-all duration-200 hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
                  >
                    <Settings2 className="w-5 h-5 text-[#3A2AEE]" />
                    <div className="flex-1">
                      <span className="font-sans font-medium text-[13px] md:text-[14px] text-white">Account Settings</span>
                      <p className="font-sans font-normal text-[11px] text-white/40">Manage your profile and security</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-[#3A2AEE] transition-colors" />
                  </Link>
                  <Link
                    to="/purchases"
                    className="flex items-center gap-4 p-4 rounded-[12px] group transition-all duration-200 hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
                  >
                    <ShoppingBag className="w-5 h-5 text-[#3A2AEE]" />
                    <div className="flex-1">
                      <span className="font-sans font-medium text-[13px] md:text-[14px] text-white">Add-ons</span>
                      <p className="font-sans font-normal text-[11px] text-white/40">Unlock features and data exports</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-[#3A2AEE] transition-colors" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

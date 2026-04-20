import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const PLAN_FEATURES: Record<string, string[]> = {
  basic: ["30 monthly credits", "Email search", "Phone search", "Username search", "No captcha"],
  intermediate: ["100 monthly credits", "Email search", "Phone search", "Username search", "No captcha", "API access"],
  advanced: ["300 monthly credits", "Email search", "Phone search", "Username search", "No captcha", "API access", "Dedicated support"],
};

const PLAN_PRICES: Record<string, string> = {
  basic: "19",
  intermediate: "49",
  advanced: "99",
};

const PLAN_CODES = ["basic", "intermediate", "advanced"] as const;

export default function Subscriptions() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const contentRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const selectedPlan = searchParams.get("plan");

  const { data: plans, refetch: refetchPlans } = trpc.purchases.getPlans.useQuery();
  const { data: activeSubs, refetch: refetchActive } = trpc.purchases.getActive.useQuery();
  const { data: history } = trpc.purchases.getBillingHistory.useQuery({ limit: 50 });
  const { data: balance } = trpc.account.getBalance.useQuery();

  const subscribeMutation = trpc.purchases.createSubscription.useMutation({
    onSuccess: (data) => {
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.success("Subscription activated!");
        refetchActive();
        refetchPlans();
      }
      setSubscribing(null);
    },
    onError: (e) => {
      toast.error(e.message || "Failed to subscribe");
      setSubscribing(null);
    },
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(contentRef.current, { filter: "blur(10px)", opacity: 0, y: 20 });
      gsap.to(contentRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.65, ease: "power3.out", delay: 0.2 });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (selectedPlan && PLAN_CODES.includes(selectedPlan as any)) {
      const planEl = document.getElementById(`plan-${selectedPlan}`);
      if (planEl) {
        setTimeout(() => {
          planEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 500);
      }
    }
  }, [selectedPlan]);

  const handleSubscribe = (planCode: string) => {
    setSubscribing(planCode);
    subscribeMutation.mutate({ plan_type: planCode as "basic" | "intermediate" | "advanced" });
  };

  const planList = (plans || []) as any[];
  const billingHistory = (history?.history || []) as any[];

  const planMap: Record<string, any> = {};
  planList.forEach((p: any) => { planMap[p.id] = p; });

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

        <div ref={contentRef} className="px-6 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-8" style={{ filter: "blur(10px)", opacity: 0 }}>
          <div>
            <h1 className="font-sans font-bold text-white text-[24px] sm:text-[28px]">Subscriptions</h1>
            <p className="font-sans font-normal text-[13px] text-white/40 mt-1">
              Get recurring monthly credits with a subscription plan.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-semibold text-white text-[14px] mb-4">Available Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLAN_CODES.map((code, idx) => {
                const features = PLAN_FEATURES[code] || [];
                const isPopular = code === "intermediate";
                const isSelected = selectedPlan === code;
                return (
                  <div
                    key={code}
                    id={`plan-${code}`}
                    className={`rounded-[16px] p-6 flex flex-col gap-5 ${isPopular ? "relative" : ""}`}
                    style={{
                      background: isSelected
                        ? "rgba(58,42,238,0.15)"
                        : isPopular
                        ? "rgba(58,42,238,0.08)"
                        : "rgba(17,16,24,0.5)",
                      border: isSelected
                        ? "2px solid #3A2AEE"
                        : isPopular
                        ? "1px solid rgba(58,42,238,0.4)"
                        : "1px solid rgba(58,42,238,0.15)",
                    }}
                  >
                    {isPopular && !isSelected && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 rounded-full text-[9px] font-bold bg-[#3A2AEE] text-white uppercase tracking-[0.06em]">
                          Popular
                        </span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 rounded-full text-[9px] font-bold bg-white text-[#3A2AEE] uppercase tracking-[0.06em]">
                          Selected
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-sans font-semibold text-white text-[16px] capitalize mb-1">{code}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="font-sans font-bold text-white text-[32px]">£{PLAN_PRICES[code]}</span>
                        <span className="font-sans font-normal text-[12px] text-white/40">/month</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {features.map((feat, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-[#3A2AEE] shrink-0" />
                          <span className="font-sans font-normal text-[12px] text-white/60">{feat}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSubscribe(code)}
                      disabled={subscribing === code || subscribeMutation.isPending}
                      className={`w-full h-[38px] rounded-[8px] font-sans font-semibold text-[12px] transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? "bg-[#3A2AEE] text-white hover:bg-[#6B5BFF]"
                          : isPopular
                          ? "bg-[#3A2AEE] text-white hover:bg-[#6B5BFF]"
                          : "bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      {subscribing === code || subscribeMutation.isPending ? "Redirecting to payment..." : "Subscribe"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {billingHistory.length > 0 && (
            <div className="rounded-[16px] overflow-hidden" style={{ background: "rgba(17,16,24,0.6)", border: "1px solid rgba(58,42,238,0.15)" }}>
              <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <h2 className="font-sans font-semibold text-white text-[14px]">Billing History</h2>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {billingHistory.map((item: any, i: number) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-sans font-medium text-[12px] text-white/80 capitalize">
                        {planMap[item.plan_code]?.name || item.plan_code || "Purchase"} #{item.id?.slice(0, 8) || i + 1}
                      </p>
                      <p className="font-sans font-normal text-[10px] text-white/30">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize ${
                      item.status === "completed"
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : item.status === "pending"
                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        : "bg-white/5 text-white/40 border border-white/10"
                    }`}>
                      {item.status || "unknown"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

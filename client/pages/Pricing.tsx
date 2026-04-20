import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useRef, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { isAuthenticated } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

gsap.registerPlugin(ScrollTrigger);

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17L4 12" stroke="#3A2AEE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PopularBadge() {
  return (
    <div
      className="h-[25px] px-[12px] rounded-[6px] flex items-center justify-center"
      style={{
        background: "linear-gradient(71.4deg, #111018 12.17%, #3A2AEE 52.417%, #D4C0EB 85.829%)",
      }}
    >
      <span className="text-[8px] font-semibold tracking-widest text-white whitespace-nowrap">
        POPULAR
      </span>
    </div>
  );
}

const PLAN_CODES: Record<string, "basic" | "intermediate" | "advanced"> = {
  "CORE": "basic",
  "PRO": "intermediate",
  "ENTERPRISE": "advanced",
};

const plans = [
  {
    name: "CORE",
    price: "$19",
    description: "For individuals starting to take their privacy seriously.",
    credits: "30 search credits",
    features: ["Username Search", "Channel Search", "Groups Search", "No Captcha"],
    border: "1px solid rgba(104,87,227,0.1)",
  },
  {
    name: "PRO",
    price: "$49",
    description: "A curated plan for the top of enterprises rapidly scaling.",
    credits: "100 search credits",
    features: ["Username Search", "Channel Search", "Groups Search", "Messages Search", "No Captcha"],
    border: "1px solid #3A2AEE",
    popular: true,
  },
  {
    name: "ENTERPRISE",
    price: "$99",
    description: "For organizations that demand scale and control.",
    credits: "300 search credits",
    features: ["Username Search", "Channel Search", "Groups Search", "No Captcha"],
    border: "1px solid rgba(104,87,227,0.1)",
  },
];

const usageRows = [
  { label: "Searches per Month", core: "30", pro: "100", enterprise: "300" },
  { label: "Channel Searching", core: true, pro: true, enterprise: true },
  { label: "Username Searching", core: true, pro: true, enterprise: true },
  { label: "Groups Searching", core: true, pro: true, enterprise: true },
  { label: "Messages Search", core: false, pro: true, enterprise: false },
  { label: "No Captcha", core: true, pro: true, enterprise: true },
];

const deliveryRows = [
  { label: "Username Searching", core: true, pro: true, enterprise: true },
  { label: "Channel Searching", core: true, pro: true, enterprise: true },
  { label: "Groups Searching", core: true, pro: true, enterprise: true },
];

const faqs = [
  {
    q: "What happens if I want more credits?",
    a: "You may purchase additional credits at any time at your current subscriptions price from the pricing page in our web application once you are logged in. You need to have an active subscription to purchase additional credits.",
  },
  {
    q: "What happens to my credits if I cancel my plan?",
    a: "Credits remain available until the end of your billing cycle. After cancellation, any unused credits are forfeited at the renewal date.",
  },
  {
    q: "Do my credits expire?",
    a: "Credits do not expire as long as your subscription remains active. Unused credits roll over to the next month.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Cancel at any time from your account settings. Your plan remains active until the end of the billing period.",
  },
];

function FaqRow({ faq, index }: { faq: typeof faqs[0]; index: number }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const ansRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    gsap.set(row, { filter: "blur(6px)", opacity: 0, y: 12 });
    ScrollTrigger.create({
      trigger: row,
      start: "top 96%",
      onEnter: () => {
        gsap.to(row, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, delay: index * 0.05, ease: "power3.out" });
      },
    });
  }, [index]);

  useEffect(() => {
    const ans = ansRef.current;
    if (!ans) return;
    if (open) {
      gsap.fromTo(ans, { height: 0, opacity: 0 }, {
        height: "auto",
        opacity: 1,
        duration: 0.4,
        ease: "power3.out",
        onComplete: () => { ans.style.height = "auto"; },
      });
    } else {
      gsap.to(ans, { height: 0, opacity: 0, duration: 0.25, ease: "power3.in" });
    }
  }, [open]);

  return (
    <div ref={rowRef} style={{ opacity: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-[17px] px-5 text-left cursor-pointer bg-transparent border-0 outline-none group"
        style={{ borderBottom: "1px solid rgba(104,87,227,0.08)" }}
      >
        <span className="text-[18px] text-white/80 pr-4 group-hover:text-white transition-colors duration-200">
          {faq.q}
        </span>
        <span
          className="shrink-0 w-6 h-6 flex items-center justify-center text-white/50 group-hover:text-brand transition-all duration-200"
          style={{
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), color 200ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      </button>
      <div ref={ansRef} style={{ height: 0, overflow: "hidden" }}>
        <p className="text-[15px] text-white/50 leading-relaxed px-5 pb-4 pt-1">{faq.a}</p>
      </div>
    </div>
  );
}

export default function Pricing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const heroHeadingRef = useRef<HTMLHeadingElement>(null);
  const heroSubRef = useRef<HTMLParagraphElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const creditNoteRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const comparisonHeadingRef = useRef<HTMLHeadingElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const compRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const compRowRefs2 = useRef<(HTMLDivElement | null)[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const selectedPlan = searchParams.get("plan");
  const authed = isAuthenticated();

  const subscribeMutation = trpc.purchases.createSubscription.useMutation({
    onSuccess: (data) => {
      setSubscribing(null);
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.success("Subscription activated!");
      }
    },
    onError: (e) => {
      toast.error(e.message || "Failed to start subscription");
      setSubscribing(null);
    },
  });

  const handlePlanClick = (planName: string) => {
    if (authed) {
      setSubscribing(planName);
      const planCode = PLAN_CODES[planName];
      subscribeMutation.mutate({ plan_type: planCode });
    } else {
      navigate(`/signup?plan=${PLAN_CODES[planName]}`);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([heroHeadingRef.current, heroSubRef.current], { filter: "blur(8px)", opacity: 0, y: 20 });
      gsap.set(cardsRef.current, { filter: "blur(10px)", opacity: 0, y: 30 });
      gsap.set(creditNoteRef.current, { filter: "blur(8px)", opacity: 0, y: 16 });
      gsap.set(comparisonRef.current, { filter: "blur(8px)", opacity: 0, y: 24 });
      gsap.set(comparisonHeadingRef.current, { filter: "blur(8px)", opacity: 0, y: 20 });
      gsap.set(faqRef.current, { filter: "blur(8px)", opacity: 0, y: 20 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(heroHeadingRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.7 }, 0.15)
        .to(heroSubRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55 }, 0.35)
        .to(cardsRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.65 }, 0.6)
        .to(creditNoteRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5 }, 0.85);

      ScrollTrigger.create({
        trigger: comparisonRef.current,
        start: "top 88%",
        onEnter: () => {
          gsap.to(comparisonRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55, ease: "power3.out" });
          gsap.to(comparisonHeadingRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.1 });

          compRowRefs.current.forEach((el, i) => {
            if (!el) return;
            gsap.set(el, { filter: "blur(8px)", opacity: 0, x: -12 });
            gsap.to(el, { filter: "blur(0px)", opacity: 1, x: 0, duration: 0.45, delay: 0.15 + i * 0.05, ease: "power3.out" });
          });
          compRowRefs2.current.forEach((el, i) => {
            if (!el) return;
            gsap.set(el, { filter: "blur(8px)", opacity: 0, x: -12 });
            gsap.to(el, { filter: "blur(0px)", opacity: 1, x: 0, duration: 0.45, delay: 0.3 + i * 0.05, ease: "power3.out" });
          });
        },
      });

      gsap.to(faqRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 });
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-[#0F0F11]">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>
        <div className="flex flex-col items-center text-center px-6 sm:px-10 pt-10 pb-20 md:pt-14 md:pb-28 lg:pb-36">
          <h1
            ref={heroHeadingRef}
            className="font-sans font-bold text-white text-5xl sm:text-6xl md:text-7xl lg:text-[75px] leading-[1.0]"
          >
            Pricing <span className="font-handwriting font-normal text-brand">Plans</span>
          </h1>
          <p ref={heroSubRef} className="text-white/60 text-base sm:text-lg md:text-xl mt-5 max-w-lg leading-relaxed">
            Supercharge your investigations with the data you need and the flexibility you want.
          </p>
        </div>
      </div>

      <div ref={cardsRef} className="px-6 sm:px-10 md:px-14 lg:px-20 xl:px-28 2xl:px-36 mt-6" style={{ opacity: 0 }}>
        <div className="flex items-start justify-center gap-4 max-w-[1500px] mx-auto">
          {plans.map((plan, i) => {
            const planCode = PLAN_CODES[plan.name];
            const isSelected = selectedPlan === planCode;
            return (
              <div key={plan.name} className="relative flex flex-col items-center">
                {plan.popular && !isSelected && (
                  <div className="mb-3">
                    <PopularBadge />
                  </div>
                )}
                {isSelected && (
                  <div className="mb-3">
                    <div className="h-[25px] px-[12px] rounded-[6px] flex items-center justify-center bg-white">
                      <span className="text-[8px] font-semibold tracking-widest text-[#3A2AEE] whitespace-nowrap">
                        SELECTED
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className="rounded-[15px] p-5 flex flex-col w-full max-w-[487px]"
                  style={{
                    background: isSelected ? "rgba(58,42,238,0.15)" : "#0F0F11",
                    border: isSelected ? "2px solid #3A2AEE" : plan.border,
                  }}
                >
                  <span className="text-[18px] font-normal text-brand tracking-wide">{plan.name}</span>
                  <p className="text-[18px] text-[#fcfcfc] opacity-90 mt-[6px] leading-snug">{plan.description}</p>
                  <div className="flex items-baseline mt-[24px] mb-[4px]">
                    <span className="text-[50px] font-medium text-[#fcfcfc] leading-none">{plan.price}</span>
                    <span className="text-[18px] text-[#fcfcfc] ml-[12px]">/month</span>
                  </div>
                  <div className="mt-[24px] flex flex-col gap-[14px] flex-1">
                    <p className="text-[18px] font-medium text-[#fcfcfc]">{plan.credits}</p>
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-[10px]">
                        <CheckIcon className="w-6 h-6 shrink-0" />
                        <span className="text-[18px] text-[#fcfcfc]">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handlePlanClick(plan.name)}
                    disabled={subscribing === plan.name || subscribeMutation.isPending}
                    className={`mt-5 w-full py-[14px] rounded-[15px] text-[18px] font-normal transition-all duration-200 btn-press cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      !!plan.popular || isSelected
                        ? "bg-brand text-[#111018] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] hover:bg-brand-light"
                        : "border border-brand text-brand hover:bg-brand/5"
                    }`}
                  >
                    {subscribing === plan.name ? "Redirecting to payment..." : authed ? "Purchase Plan" : "Get Started"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={creditNoteRef} className="max-w-[747px] mx-auto text-center mt-8" style={{ opacity: 0 }}>
          <p className="text-[18px] text-white leading-relaxed">
            Once subscribed to the platform, you can purchase up to 5000 credits at any time.{" "}
            <br className="hidden sm:block" />
            For larger credit packages or more information,{" "}
            <a href="#" className="text-brand underline hover:text-brand/80 transition-colors">
              please contact us
            </a>
            .
          </p>
        </div>
      </div>

      <div ref={comparisonRef} className="px-6 sm:px-10 md:px-14 lg:px-20 xl:px-28 2xl:px-36 mt-20 md:mt-28">
        <h2
          ref={comparisonHeadingRef}
          className="text-[50px] font-bold text-white text-center mb-10"
        >
          Detailed <span className="font-handwriting font-normal text-brand">Comparison</span>
        </h2>

        <div className="mb-8">
          <p className="text-[25px] text-white mb-3">Usage &amp; Billing</p>
          <div style={{ background: "#0F0F11" }}>
            <div className="flex items-center gap-4 px-4 py-3">
              <span className="w-[196px] shrink-0" />
              <div className="flex-1 grid grid-cols-3 gap-2">
                {["Core", "Pro", "Enterprise"].map((name, i) => (
                  <div key={name} className="flex items-center gap-[10px]">
                    <span className="text-[18px] text-[#fcfcfc]/70 font-normal">{name}</span>
                    <button
                      onClick={() => handlePlanClick(name.toUpperCase())}
                      disabled={subscribing === name.toUpperCase() || subscribeMutation.isPending}
                      className={`px-5 py-[7px] rounded-[15px] text-[18px] font-normal transition-all duration-200 btn-press cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        i === 1
                          ? "bg-brand text-[#111018] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                          : "border border-brand/30 text-brand hover:bg-brand/5"
                      }`}
                    >
                      {subscribing === name.toUpperCase() ? "..." : authed ? "Purchase" : "Get Started"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {usageRows.map((row, ri) => (
              <div
                key={ri}
                ref={(el) => { compRowRefs.current[ri] = el; }}
              >
                <div
                  className="flex items-center gap-4 px-4 py-[17px]"
                  style={{
                    background: ri % 2 === 0 ? "rgba(29,29,35,0.6)" : "transparent",
                  }}
                >
                  <span className="w-[196px] shrink-0 text-[18px] text-[#fcfcfc]/70">{row.label}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {[row.core, row.pro, row.enterprise].map((val, ci) => (
                      <div key={ci} className="flex items-center">
                        {typeof val === "boolean" ? (
                          val ? (
                            <CheckIcon className="w-8 h-8" />
                          ) : (
                            <span className="text-[24px] text-[#fcfcfc]/20">-</span>
                          )
                        ) : (
                          <span className="text-[24px] font-semibold text-[#fcfcfc]">{val}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[25px] text-white mb-3">Payment Methods</p>
          <div style={{ background: "#0F0F11" }}>
            {deliveryRows.map((row, ri) => (
              <div
                key={ri}
                ref={(el) => { compRowRefs2.current[ri] = el; }}
              >
                <div
                  className="flex items-center gap-4 px-4 py-[17px]"
                  style={{
                    background: ri % 2 === 0 ? "rgba(29,29,35,0.6)" : "transparent",
                  }}
                >
                  <span className="w-[196px] shrink-0 text-[18px] text-[#fcfcfc]/70">{row.label}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {[row.core, row.pro, row.enterprise].map((val, ci) => (
                      <div key={ci} className="flex items-center">
                        {val ? (
                          <CheckIcon className="w-8 h-8" />
                        ) : (
                          <span className="text-[24px] text-[#fcfcfc]/20">-</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={faqRef} className="px-6 sm:px-10 md:px-14 lg:px-20 xl:px-28 2xl:px-36 mt-20 md:mt-28" style={{ opacity: 0 }}>
        <div className="max-w-[865px] mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-[50px] font-bold text-white">Got questions?</h2>
            <p className="font-handwriting font-normal text-brand text-[40px] mt-1">
              We have already answered them
            </p>
          </div>

          <div style={{ background: "#0F0F11" }}>
            {faqs.map((faq, i) => (
              <FaqRow key={i} faq={faq} index={i} />
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

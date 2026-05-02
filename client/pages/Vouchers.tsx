import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Ticket, Gift, ArrowDownRight } from "lucide-react";

export default function Vouchers() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const titleRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const [code, setCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [successData, setSuccessData] = useState<{ code: string; amount: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: balanceData } = trpc.credits.getBalance.useQuery();
  const { data: transactions } = trpc.credits.listTransactions.useQuery({ limit: 50 });

  const redeemMutation = trpc.credits.redeemVoucher.useMutation({
    onSuccess: (data) => {
      setProcessing(false);
      setSuccessData({ code: code, amount: data.creditsAdded });
      setCode("");
      utils.credits.getBalance.invalidate();
      utils.credits.listTransactions.invalidate();
      gsap.fromTo(".success-card", { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.5)" });
    },
    onError: (e) => {
      setProcessing(false);
      toast.error(getUserFriendlyErrorMessage(e));
    },
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([titleRef.current, formRef.current, historyRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(titleRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.2)
        .to(formRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.35)
        .to(historyRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.5);
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const handleRedeem = () => {
    if (!code.trim()) {
      toast.error("Enter a voucher code");
      return;
    }
    setProcessing(true);
    setSuccessData(null);
    redeemMutation.mutate({ code: code.trim().toUpperCase() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRedeem();
    }
  };

  const voucherTxns = ((transactions?.transactions || []) as any[]).filter(
    (t: any) => t.transaction_type === "voucher_redemption"
  );

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0f0f11] flex flex-col">
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

        <div className="px-6 sm:px-10 lg:px-14 xl:px-20 pt-6 md:pt-8 pb-10 md:pb-14 flex flex-col gap-8">
          <div ref={titleRef} style={{ filter: "blur(10px)", opacity: 0 }}>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Redeem <span className="font-handwriting text-[#3a2aee] text-[32px] sm:text-[36px] md:text-[40px]">Voucher</span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3">
              Have a code? Enter it below to claim your credits
            </p>
          </div>

          <div ref={formRef} className="card-border-gradient rounded-[20px] p-6 md:p-8" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-[10px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5 text-[#3A2AEE]" />
              </div>
              <div>
                <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Enter voucher code</h2>
                <p className="font-sans font-normal text-[12px] text-white/40 mt-0.5">
                  Codes are typically 8-16 characters, all caps with numbers
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={handleKeyDown}
                placeholder="e.g. BETA2026 or WELCOME100"
                className="flex-1 bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[52px] px-5 outline-none font-mono font-semibold text-[16px] text-white/90 placeholder:text-white/20 tracking-wider transition-colors focus:border-[rgba(58,42,238,0.4)]"
                disabled={processing}
              />
              <button
                onClick={handleRedeem}
                disabled={processing || !code.trim()}
                className="px-8 rounded-[12px] bg-[#3A2AEE] font-sans font-semibold text-[14px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Redeem"
                )}
              </button>
            </div>

            {successData && (
              <div className="success-card mt-6 p-5 rounded-[12px]" style={{ background: "rgba(5,223,114,0.08)", border: "1px solid rgba(5,223,114,0.2)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#05df72]/15 flex items-center justify-center">
                    <ArrowDownRight className="w-5 h-5 text-[#05df72]" />
                  </div>
                  <div>
                    <p className="font-sans font-semibold text-[14px] text-[#05df72]">Credits added!</p>
                    <p className="font-sans font-normal text-[12px] text-white/50">
                      {successData.amount} credits from code <span className="font-mono text-white/70">{successData.code}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {voucherTxns.length > 0 && (
            <div ref={historyRef} className="card-border-gradient rounded-[20px] p-6 md:p-8" style={{ filter: "blur(10px)", opacity: 0 }}>
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-5">Redemption History</h2>
              <div className="flex flex-col gap-2">
                {voucherTxns.map((txn: any, i: number) => (
                  <div
                    key={txn.id || i}
                    className="flex items-center justify-between py-3"
                    style={{ borderBottom: i < voucherTxns.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[8px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                        <Ticket className="w-4 h-4 text-[#3A2AEE]" />
                      </div>
                      <div>
                        <p className="font-sans font-medium text-[13px] text-white/80">{txn.reference || "Voucher redemption"}</p>
                        <p className="font-sans font-normal text-[11px] text-white/40">
                          {txn.created_at ? new Date(txn.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[14px] text-[#05df72]">+{txn.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-[#0f0f11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

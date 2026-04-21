import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Minus } from "lucide-react";

export default function AdminCredits() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"adjust" | "set">("adjust");

  const { data: users } = trpc.admin.users.search.useQuery(
    { query: targetEmail, limit: 5 },
    { enabled: targetEmail.length > 1 }
  );
  const { data: targetBalance } = trpc.admin.credits.getUserBalance.useQuery(
    { userId: targetUserId },
    { enabled: !!targetUserId }
  );

  const adjustMutation = trpc.admin.credits.adjust.useMutation({
    onSuccess: () => { toast.success("Credits adjusted"); setAmount(""); setReason(""); setTargetEmail(""); setTargetUserId(""); },
    onError: (e) => toast.error(e.message),
  });
  const setBalanceMutation = trpc.admin.credits.setBalance.useMutation({
    onSuccess: () => { toast.success("Balance set"); setAmount(""); setReason(""); setTargetEmail(""); setTargetUserId(""); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".credits-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".credit-form-card", { filter: "blur(8px)", opacity: 0, y: 20 });
      gsap.set(".credit-guide-card", { filter: "blur(8px)", opacity: 0, y: 16 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".credits-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".credit-form-card", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55 }, 0.25)
        .to(".credit-guide-card", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55 }, 0.4);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const userList = (users?.users || []) as any[];
  const inputCls = "w-full bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[48px] px-5 outline-none font-sans text-[13px] text-white/80 placeholder:text-white/30 input-glow";
  const labelCls = "block font-sans font-semibold text-[11px] text-white/50 uppercase tracking-[0.06em] mb-2";

  const handleSubmit = () => {
    if (!targetUserId || !amount || !reason) return;
    if (mode === "adjust") {
      adjustMutation.mutate({ userId: targetUserId, amount: Number(amount), reason });
    } else {
      setBalanceMutation.mutate({ userId: targetUserId, newBalance: Number(amount), reason });
    }
  };

  return (
    <div ref={contentRef}>
      <h1 className="credits-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none mb-8">
        Credit <span className="font-handwriting text-[#3A2AEE]">Management</span>
      </h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="credit-form-card card-border-gradient rounded-[20px] p-6 md:p-8">
          <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">
            {mode === "adjust" ? "Adjust Credits" : "Set Balance"}
          </h2>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("adjust")}
              className={`flex-1 h-[44px] rounded-[10px] font-sans font-semibold text-[13px] cursor-pointer border-0 transition-all duration-200 ${
                mode === "adjust"
                  ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                  : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              Adjust
            </button>
            <button
              onClick={() => setMode("set")}
              className={`flex-1 h-[44px] rounded-[10px] font-sans font-semibold text-[13px] cursor-pointer border-0 transition-all duration-200 ${
                mode === "set"
                  ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                  : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              Set Exact
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>User email</label>
              <input
                type="email"
                value={targetEmail}
                onChange={(e) => { setTargetEmail(e.target.value); setTargetUserId(""); }}
                placeholder="Search by email..."
                className={inputCls}
              />
              {userList.length > 0 && !targetUserId && (
                <div className="mt-1 rounded-[8px] overflow-hidden" style={{ border: "1px solid rgba(58,42,238,0.15)" }}>
                  {userList.map((u: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => { setTargetUserId(u.id); setTargetEmail(u.email); }}
                      className="w-full px-3 py-2 text-left hover:bg-[rgba(58,42,238,0.08)] transition-colors cursor-pointer bg-transparent border-0 border-b border-white/[0.04] last:border-0"
                    >
                      <p className="font-sans font-normal text-[11px] text-white/70">{u.email}</p>
                      <p className="font-sans font-normal text-[10px] text-white/30">{u.id}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>User ID</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="Paste user ID directly..."
                className={inputCls}
              />
              {targetBalance && (
                <p className="mt-1 font-sans font-normal text-[11px] text-green-400">
                  Current balance: {targetBalance.balance} credits
                </p>
              )}
            </div>

            <div>
              <label className={labelCls}>{mode === "adjust" ? "Amount (positive = add, negative = deduct)" : "New balance"}</label>
              <div className="relative">
                {mode === "adjust" && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex gap-1.5 z-10">
                    <button
                      onClick={() => setAmount(String(-Math.abs(Number(amount) || 0)))}
                      className="w-9 h-9 rounded-[7px] bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5 text-white/50" />
                    </button>
                    <button
                      onClick={() => setAmount(String(Math.abs(Number(amount) || 0)))}
                      className="w-9 h-9 rounded-[7px] bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-white/50" />
                    </button>
                  </div>
                )}
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={mode === "adjust" ? "e.g. 50 or -20" : "e.g. 200"}
                  className={`${inputCls} ${mode === "adjust" ? "pl-[95px]" : ""}`}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Reason (required)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Promotional grant, Abuse penalty..."
                className={inputCls}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={
                !targetUserId ||
                !amount ||
                !reason ||
                adjustMutation.isPending ||
                setBalanceMutation.isPending
              }
              className="w-full h-[44px] rounded-[10px] bg-[#3A2AEE] text-white font-sans font-semibold text-[13px] hover:bg-[#4a3aff] transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
            >
              {adjustMutation.isPending || setBalanceMutation.isPending ? "Processing..." : mode === "adjust" ? "Apply Adjustment" : "Set Balance"}
            </button>
          </div>
        </div>

        <div className="credit-guide-card card-border-gradient rounded-[20px] p-6 md:p-8">
          <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Quick Guide</h2>
          <div className="flex flex-col gap-4">
            {[
              { title: "Adjust Credits", desc: "Add or remove credits from a user's balance. Use positive numbers to add, negative to deduct.", example: "Amount: +50 → adds 50 credits" },
              { title: "Set Balance", desc: "Force a user's balance to an exact value. Useful for support overrides.", example: "New balance: 200 → sets balance to 200" },
              { title: "Audit Trail", desc: "Every credit change is logged in the audit logs with the reason you provide.", example: "" },
            ].map((guide, i) => (
              <div key={i} className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.05)", border: "1px solid rgba(58,42,238,0.1)" }}>
                <p className="font-sans font-medium text-[13px] text-white/80 mb-2">{guide.title}</p>
                <p className="font-sans font-normal text-[12px] text-white/40 leading-relaxed">{guide.desc}</p>
                {guide.example && (
                  <p className="font-mono text-[11px] text-[#3A2AEE]/70 mt-2">{guide.example}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

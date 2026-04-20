import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Ticket, RefreshCw } from "lucide-react";

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17L4 12" stroke="#3A2AEE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function AdminVouchers() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [activeOnly, setActiveOnly] = useState(true);

  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [maxRedemptations, setMaxRedemptations] = useState("");
  const [singleUse, setSingleUse] = useState(true);

  const { data, refetch } = trpc.admin.vouchers.list.useQuery({ activeOnly });
  const { data: redemptions } = trpc.admin.vouchers.listRedemptions.useQuery(
    { voucherId: selectedVoucher?.id || "" },
    { enabled: !!selectedVoucher?.id }
  );

  const createMutation = trpc.admin.vouchers.create.useMutation({
    onSuccess: () => {
      toast.success("Voucher created successfully");
      setShowCreate(false);
      setCode("");
      setAmount("");
      setMaxRedemptations("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const disableMutation = trpc.admin.vouchers.disable.useMutation({
    onSuccess: () => {
      toast.success("Voucher disabled");
      refetch();
      setSelectedVoucher(null);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".vouchers-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".voucher-card", { filter: "blur(8px)", opacity: 0, y: 16 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".vouchers-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".voucher-card", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5 }, 0.25);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const voucherList = (data?.vouchers || []) as any[];
  const redemptionList = (redemptions?.redemptions || []) as any[];

  const inputCls = "w-full bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[44px] px-4 font-sans text-[13px] text-white/80 placeholder:text-white/30 input-glow";
  const labelCls = "block font-sans font-semibold text-[11px] text-white/50 uppercase tracking-[0.06em] mb-2";

  return (
    <div ref={contentRef}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="vouchers-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
            Voucher <span className="font-handwriting text-[#3A2AEE]">Management</span>
          </h1>
          <p className="font-sans font-normal text-[13px] text-white/40 mt-2">Create and manage redemption codes</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-transparent border border-white/10 text-white/60 font-sans text-[12px] hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`px-4 py-2.5 rounded-[10px] font-sans text-[12px] transition-colors cursor-pointer border-0 ${
              activeOnly
                ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
            }`}
          >
            {activeOnly ? "Active only" : "Show all"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#3A2AEE] text-white font-sans text-[13px] font-semibold hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Create Voucher
          </button>
        </div>
      </div>

      <div className="voucher-card card-border-gradient rounded-[20px] overflow-hidden">
        {voucherList.length > 0 ? (
          <div className="grid gap-0">
            <div className="grid grid-cols-6 gap-4 px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider">Code</span>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider">Credits</span>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider">Max Uses</span>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider">Redemptions</span>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider">Status</span>
              <span className="font-sans text-[11px] font-medium text-white/50 uppercase tracking-wider text-right">Actions</span>
            </div>
            {voucherList.map((v: any, i: number) => (
              <div
                key={i}
                className="grid grid-cols-6 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors cursor-pointer"
                style={{ borderBottom: i < voucherList.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                onClick={() => setSelectedVoucher(v)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[8px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                    <Ticket className="w-4 h-4 text-[#3A2AEE]" />
                  </div>
                  <span className="font-mono font-semibold text-[13px] text-[#3A2AEE]">{v.code}</span>
                </div>
                <span className="font-sans font-semibold text-[14px] text-[#05df72]">{v.amount}</span>
                <span className="font-sans text-[13px] text-white/50">{v.max_redemptions || "Unlimited"}</span>
                <span className="font-sans text-[13px] text-white/50">{v.redemption_count ?? v.redemptions_count ?? 0}</span>
                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-semibold w-fit ${
                  v.active
                    ? "bg-[#05df72]/10 text-[#05df72] border border-[#05df72]/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {v.active ? "Active" : "Disabled"}
                </span>
                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setSelectedVoucher(v)}
                    className="px-3 py-1.5 rounded-[6px] bg-white/5 border border-white/10 text-white/60 text-[11px] hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    View
                  </button>
                  {v.active && (
                    <button
                      onClick={() => disableMutation.mutate({ id: v.id })}
                      className="px-3 py-1.5 rounded-[6px] bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <Ticket className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <p className="font-sans text-[14px] text-white/30">No vouchers found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 rounded-[8px] bg-[#3A2AEE] text-white font-sans text-[12px] hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
            >
              Create your first voucher
            </button>
          </div>
        )}
      </div>

      {showCreate && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md card-border-gradient rounded-[20px] p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-sans font-semibold text-white text-[18px]">Create Voucher</h2>
                <p className="font-sans text-[12px] text-white/40 mt-1">Generate a redemption code</p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/60"/>
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className={labelCls}>Voucher Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
                  placeholder="e.g. BETA2026"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Credits Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Max Redemptations</label>
                <input
                  type="number"
                  value={maxRedemptations}
                  onChange={(e) => setMaxRedemptations(e.target.value)}
                  placeholder="Leave empty for unlimited"
                  className={inputCls}
                />
              </div>

              <div className="flex items-center gap-3 p-4 rounded-[12px]" style={{ background: "rgba(58,42,238,0.08)", border: "1px solid rgba(58,42,238,0.15)" }}>
                <button
                  onClick={() => setSingleUse(!singleUse)}
                  className={`w-6 h-6 rounded-[6px] border flex items-center justify-center transition-colors cursor-pointer border-0 ${
                    singleUse ? "bg-[#3A2AEE]" : "bg-white/5 border border-white/20"
                  }`}
                >
                  {singleUse && <CheckIcon />}
                </button>
                <div>
                  <p className="font-sans font-medium text-[13px] text-white/80">Single use only</p>
                  <p className="font-sans text-[11px] text-white/40">Voucher will be disabled after first redemption</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => createMutation.mutate({
                    code,
                    amount: Number(amount),
                    maxRedemptions: maxRedemptations ? Number(maxRedemptations) : undefined,
                    singleUse,
                  })}
                  disabled={createMutation.isPending || !code || !amount}
                  className="flex-1 h-[48px] rounded-[10px] bg-[#3A2AEE] text-white font-sans font-semibold text-[13px] hover:bg-[#4a3aff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)]"
                >
                  {createMutation.isPending ? "Creating..." : "Create Voucher"}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-6 h-[48px] rounded-[10px] bg-white/5 border border-white/10 text-white/60 font-sans font-medium text-[13px] hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedVoucher && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
          onClick={() => setSelectedVoucher(null)}
        >
          <div
            className="w-full max-w-lg rounded-[20px] overflow-hidden card-border-gradient"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-[14px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-[#3A2AEE]" />
                </div>
                <div>
                  <h2 className="font-sans font-semibold text-white text-[18px]">Voucher Details</h2>
                  <p className="font-mono font-semibold text-[14px] text-[#3A2AEE] mt-1">{selectedVoucher.code}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVoucher(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/60"/>
                </svg>
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: "Credits", value: selectedVoucher.amount, color: "text-[#05df72]" },
                  { label: "Max Uses", value: selectedVoucher.max_redemptions || "Unlimited", color: "text-white/80" },
                  { label: "Redemptions", value: redemptionList.length, color: "text-white/80" },
                  { label: "Status", value: selectedVoucher.active ? "Active" : "Disabled", color: selectedVoucher.active ? "text-[#05df72]" : "text-red-400" },
                ].map((stat, i) => (
                  <div key={i} className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.06)", border: "1px solid rgba(58,42,238,0.1)" }}>
                    <p className="font-sans text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className={`font-sans font-semibold text-[18px] ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <h3 className="font-sans font-semibold text-[13px] text-white/60 uppercase tracking-wider mb-3">Redemption History</h3>
              {redemptionList.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {redemptionList.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-[8px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div>
                        <p className="font-sans text-[12px] text-white/70">{r.email}</p>
                        <p className="font-mono text-[10px] text-white/30 mt-0.5">{r.user_id}</p>
                      </div>
                      <span className="font-sans text-[10px] text-white/40">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="font-sans text-[12px] text-white/30">No redemptions yet</p>
                </div>
              )}

              {selectedVoucher.active && (
                <button
                  onClick={() => {
                    disableMutation.mutate({ id: selectedVoucher.id });
                    setSelectedVoucher(null);
                  }}
                  className="w-full mt-6 h-[44px] rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-400 font-sans font-medium text-[13px] hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Disable Voucher
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

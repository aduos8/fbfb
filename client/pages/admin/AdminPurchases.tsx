import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShoppingBag, RefreshCw, RotateCcw } from "lucide-react";

export default function AdminPurchases() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState("completed");

  const { data, refetch } = trpc.admin.purchases.list.useQuery({ status: statusFilter as any });
  const refundMutation = trpc.admin.purchases.refund.useMutation({
    onSuccess: () => { toast.success("Purchase refunded"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".purchases-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".purchase-row", { filter: "blur(6px)", opacity: 0, y: 12 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".purchases-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".purchase-row", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.4, stagger: 0.03 }, 0.35);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const purchaseList = (data?.purchases || []) as any[];

  return (
    <div ref={contentRef}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="purchases-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
            Purchase <span className="font-handwriting text-[#3A2AEE]">Management</span>
          </h1>
          <p className="font-sans text-[13px] text-white/40 mt-2">View and manage user purchases</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[44px] px-4 font-sans text-[13px] text-white/80 outline-none cursor-pointer input-glow"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
            <option value="pending">Pending</option>
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] bg-transparent border border-white/10 text-white/60 font-sans text-[12px] hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="card-border-gradient rounded-[20px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Purchase ID", "User ID", "Item", "Cost", "Status", "Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-4 text-left font-sans font-medium text-[11px] text-white/50 uppercase tracking-[0.06em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {purchaseList.map((p: any, i: number) => (
              <tr key={i} className="purchase-row hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-4">
                  <span className="font-mono text-[11px] text-white/40">{p.id}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-mono text-[11px] text-white/40">{p.user_id}</span>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <p className="font-sans font-medium text-[13px] text-white/80">{p.item_name || p.itemId}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="font-sans font-semibold text-[13px] text-white/60">{p.credit_cost || p.creditCost || 0} cr</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-semibold capitalize ${
                    p.status === "completed" ? "bg-[#05df72]/10 text-[#05df72] border border-[#05df72]/20" :
                    p.status === "refunded" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                    "bg-white/5 text-white/40 border border-white/10"
                  }`}>
                    {p.status || "unknown"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-sans font-normal text-[12px] text-white/40">
                    {p.purchased_at ? new Date(p.purchased_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {p.status === "completed" && (
                    <button
                      onClick={() => {
                        if (confirm("Refund this purchase?")) refundMutation.mutate({ purchaseId: p.id, reason: "Admin refund" });
                      }}
                      disabled={refundMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-transparent border border-yellow-500/20 text-yellow-400/70 font-sans font-medium text-[11px] hover:bg-yellow-500/5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchaseList.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingBag className="w-10 h-10 text-white/15 mx-auto mb-4" />
            <p className="font-sans font-normal text-[13px] text-white/30">No purchases found</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { ScrollText, RefreshCw, Filter } from "lucide-react";

function actionLabel(action?: string | null): string {
  if (!action) return "Unknown";

  const exactLabels: Record<string, string> = {
    credit_adjustment: "Credits adjusted",
    credit_set_balance: "Credit balance set",
    user_role_change: "User role changed",
    purchase_refund: "Purchase refunded",
    voucher_create: "Voucher created",
    voucher_update: "Voucher updated",
    voucher_delete: "Voucher deleted",
    user_suspend: "User suspended",
    user_activate: "User activated",
  };

  const known = exactLabels[action];
  if (known) return known;

  return action
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function AdminAuditLogs() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, refetch } = trpc.admin.auditLogs.search.useQuery({
    action: actionFilter || undefined,
    startDate: dateFrom || undefined,
    endDate: dateTo || undefined,
    limit: 100,
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".auditlogs-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".auditlogs-table", { filter: "blur(8px)", opacity: 0, y: 16 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".auditlogs-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".auditlogs-table", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5 }, 0.3);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const logList = (data?.logs || []) as any[];

  return (
    <div ref={contentRef}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="auditlogs-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
            Audit <span className="font-handwriting text-[#3A2AEE]">Logs</span>
          </h1>
          <p className="font-sans text-[13px] text-white/40 mt-2">Track all admin actions</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-transparent border border-white/10 text-white/60 font-sans text-[12px] hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
          <Filter className="w-4 h-4 text-white/40" />
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by action..."
            className="bg-transparent outline-none font-sans text-[13px] text-white/60 placeholder:text-white/30 w-[180px]"
          />
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
          <span className="font-sans text-[12px] text-white/40">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-transparent outline-none font-sans text-[13px] text-white/60 [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
          <span className="font-sans text-[12px] text-white/40">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-transparent outline-none font-sans text-[13px] text-white/60 [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="auditlogs-table card-border-gradient rounded-[20px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Timestamp", "Admin", "Action", "Target", "Details"].map((h) => (
                <th key={h} className="px-4 py-4 text-left font-sans font-medium text-[11px] text-white/50 uppercase tracking-[0.06em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {logList.map((log: any, i: number) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-4">
                  <span className="font-sans font-normal text-[12px] text-white/40">
                    {log.created_at ? new Date(log.created_at).toLocaleString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    }) : "-"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-mono text-[11px] text-white/40">{log.admin_id || log.adminId || "-"}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-sans font-medium text-[13px] text-white/70">
                    {actionLabel(log.action)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-mono text-[11px] text-white/30">{log.target_entity || log.targetEntity || log.target_id || "-"}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-sans font-normal text-[11px] text-white/30 line-clamp-1">
                    {(() => {
                      try {
                        const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
                        if (!meta) return "-";
                        if (log.action === "credit_adjustment" || log.action === "credit_set_balance") {
                          return `${meta.amount > 0 ? "+" : ""}${meta.amount} credits${meta.reason ? ` - ${meta.reason}` : ""}`;
                        }
                        if (log.action === "user_role_change") return `Role: ${meta.role}`;
                        if (log.action === "purchase_refund") return meta.reason || "Refunded";
                        return meta.reason || JSON.stringify(meta);
                      } catch { return "-"; }
                    })()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logList.length === 0 && (
          <div className="py-16 text-center">
            <ScrollText className="w-10 h-10 text-white/15 mx-auto mb-4" />
            <p className="font-sans font-normal text-[13px] text-white/30">No audit logs found</p>
          </div>
        )}
      </div>
    </div>
  );
}

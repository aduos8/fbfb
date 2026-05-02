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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
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

      <div className="grid grid-cols-1 gap-3 mb-6 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
          <Filter className="w-4 h-4 text-white/40" />
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by action..."
            className="bg-transparent outline-none font-sans text-[13px] text-white/60 placeholder:text-white/30 w-full"
          />
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
          <span className="font-sans text-[12px] text-white/40">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-transparent outline-none font-sans text-[13px] text-white/60 [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 rounded-[12px] bg-[#232327] border border-[rgba(255,255,255,0.08)]">
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
        <table className="hidden lg:table w-full">
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
        <div className="lg:hidden divide-y divide-white/[0.04]">
          {logList.map((log: any, i: number) => (
            <div key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans font-medium text-[13px] text-white/78">{actionLabel(log.action)}</p>
                  <p className="mt-1 font-sans text-[11px] text-white/38">
                    {log.created_at ? new Date(log.created_at).toLocaleString("en-GB", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    }) : "-"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-sans text-[10px] text-white/45">
                  Admin
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Admin ID</span>
                  <span className="max-w-[62%] break-all text-right font-mono text-[11px] text-white/45">{log.admin_id || log.adminId || "-"}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Target</span>
                  <span className="max-w-[62%] break-all text-right font-mono text-[11px] text-white/40">{log.target_entity || log.targetEntity || log.target_id || "-"}</span>
                </div>
                <p className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-sans text-[11px] leading-5 text-white/45">
                  {(() => {
                    try {
                      const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
                      if (!meta) return "No details";
                      if (log.action === "credit_adjustment" || log.action === "credit_set_balance") {
                        return `${meta.amount > 0 ? "+" : ""}${meta.amount} credits${meta.reason ? ` - ${meta.reason}` : ""}`;
                      }
                      if (log.action === "user_role_change") return `Role: ${meta.role}`;
                      if (log.action === "purchase_refund") return meta.reason || "Refunded";
                      return meta.reason || JSON.stringify(meta);
                    } catch { return "No details"; }
                  })()}
                </p>
              </div>
            </div>
          ))}
        </div>
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

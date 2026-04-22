import { useRef, useEffect } from "react";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";

function actionLabel(action?: string | null): string {
  if (!action) return "Unknown action";

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

export default function AdminOverview() {
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: users } = trpc.admin.users.list.useQuery({ status: "all", limit: 5 });
  const { data: vouchers } = trpc.admin.vouchers.list.useQuery({ activeOnly: true, limit: 5 });
  const { data: auditLogs } = trpc.admin.auditLogs.list.useQuery({});

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".admin-stat-card", { filter: "blur(8px)", opacity: 0, y: 16 });
      gsap.set(".admin-section", { filter: "blur(8px)", opacity: 0, y: 16 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".admin-stat-card", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0.2)
        .to(".admin-section", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, 0.4);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const userList = (users?.users || []) as any[];
  const voucherList = (vouchers?.vouchers || []) as any[];
  const logList = (auditLogs?.logs || []) as any[];

  return (
    <div ref={contentRef}>
      <h1 className="font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none mb-8">
        Dashboard <span className="font-handwriting text-[#3A2AEE]">Overview</span>
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Users", value: userList.length, icon: "U" },
          { label: "Active Vouchers", value: voucherList.length, icon: "V" },
          { label: "Purchases", value: "-", icon: "P" },
          { label: "Audit Logs", value: logList.length, icon: "A" },
        ].map((stat, i) => (
          <div
            key={i}
            className="admin-stat-card card-border-gradient rounded-[20px] p-5"
          >
            <div className="w-10 h-10 rounded-[10px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center mb-3">
              <span className="font-sans font-semibold text-[13px] text-[#3A2AEE]">{stat.icon}</span>
            </div>
            <span className="font-sans font-semibold text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-1">{stat.label}</span>
            <span className="font-sans font-bold text-[28px] text-white leading-none">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="admin-section card-border-gradient rounded-[20px] p-6 md:p-8">
          <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-5">Recent Users</h2>
          {userList.length > 0 ? (
            <div className="flex flex-col gap-1">
              {userList.slice(0, 5).map((u: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] bg-[rgba(58,42,238,0.15)] flex items-center justify-center">
                      <span className="text-[11px] text-white/70 font-medium">{(u.email as string || "U").charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-sans font-normal text-[12px] md:text-[13px] text-white/70">{u.email}</p>
                      <p className="font-sans font-normal text-[10px] text-white/30">{u.role}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold capitalize ${
                    u.status === "active" ? "bg-[#05df72]/10 text-[#05df72] border border-[#05df72]/20" :
                    u.status === "suspended" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                    "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}>
                    {u.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-sans text-[13px] text-white/40 text-center py-8">No users found</p>
          )}
        </div>

        <div className="admin-section card-border-gradient rounded-[20px] p-6 md:p-8">
          <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-5">Recent Audit Logs</h2>
          {logList.length > 0 ? (
            <div className="flex flex-col gap-1">
              {logList.slice(0, 5).map((log: any, i: number) => (
                <div key={i} className="py-3 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-medium text-[12px] md:text-[13px] text-white/70">{actionLabel(log.action)}</span>
                    <span className="font-sans font-normal text-[10px] text-white/30">
                      {log.created_at ? new Date(log.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {log.target_entity && (
                    <p className="font-sans font-normal text-[10px] text-white/30 mt-0.5">
                      Target: {log.target_entity}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="font-sans text-[13px] text-white/40 text-center py-8">No audit logs yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

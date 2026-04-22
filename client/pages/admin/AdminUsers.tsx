import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Ban, UserX, Eye, ChevronLeft, ChevronRight, RefreshCw, ChevronDown } from "lucide-react";

function StatusDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = [
    { value: "all", label: "All Users" },
    { value: "active", label: "Active" },
    { value: "suspended", label: "Suspended" },
    { value: "banned", label: "Banned" },
  ];

  const selectedLabel = options.find((o) => o.value === value)?.label || "All Users";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[48px] px-4 font-sans text-[13px] text-white/80 hover:border-[rgba(58,42,238,0.4)] transition-colors cursor-pointer"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[160px] rounded-[8px] overflow-hidden z-50" style={{ background: "#1a1a1f", border: "1px solid rgba(58,42,238,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left font-sans text-[13px] transition-colors cursor-pointer ${
                opt.value === value ? "text-white bg-[rgba(58,42,238,0.15)]" : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "banned">("all");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<"info" | "purchases" | "transactions">("info");
  const { data: currentUser } = trpc.auth.me.useQuery(undefined, { retry: false });
  const currentUserIsOwner = currentUser?.role === "owner";

  const { data, refetch } = trpc.admin.users.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 20,
    offset: page * 20,
  });
  const { data: searchResults } = trpc.admin.users.search.useQuery(
    { query, limit: 20 },
    { enabled: query.length > 0 }
  );

  const suspendMutation = trpc.admin.users.suspend.useMutation({
    onSuccess: () => { toast.success("User suspended"); refetch(); setSelectedUser(null); },
    onError: (e) => toast.error(e.message),
  });
  const unsuspendMutation = trpc.admin.users.unsuspend.useMutation({
    onSuccess: () => { toast.success("User unsuspended"); refetch(); setSelectedUser(null); },
    onError: (e) => toast.error(e.message),
  });
  const banMutation = trpc.admin.users.ban.useMutation({
    onSuccess: () => { toast.success("User banned"); refetch(); setSelectedUser(null); },
    onError: (e) => toast.error(e.message),
  });
  const changeRoleMutation = trpc.admin.users.changeRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: userDetail } = trpc.admin.users.getById.useQuery(
    { id: selectedUser?.id || "" },
    { enabled: !!selectedUser?.id }
  );
  const { data: userPurchases } = trpc.admin.users.getUserPurchases.useQuery(
    { userId: selectedUser?.id || "" },
    { enabled: !!selectedUser?.id && detailTab === "purchases" }
  );
  const { data: userTransactions } = trpc.admin.users.getUserTransactions.useQuery(
    { userId: selectedUser?.id || "" },
    { enabled: !!selectedUser?.id && detailTab === "transactions" }
  );

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".users-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".user-row", { filter: "blur(6px)", opacity: 0, y: 12 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".users-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".user-row", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.4, stagger: 0.04 }, 0.3);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const displayList = query.length > 0 ? (searchResults?.users || []) : (data?.users || []);
  const userList = displayList as any[];

  return (
    <div ref={contentRef}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="users-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
          User <span className="font-handwriting text-[#3A2AEE]">Management</span>
        </h1>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-transparent border border-white/10 text-white/50 font-sans font-normal text-[11px] hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[10px] bg-[rgba(58,42,238,0.1)] flex items-center justify-center">
            <Search className="w-4 h-4 text-white/40" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder="Search by email..."
            className="w-full bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[48px] pl-14 pr-4 outline-none font-sans text-[13px] text-white/80 placeholder:text-white/30 input-glow"
          />
        </div>
        <StatusDropdown
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v as any); setPage(0); }}
        />
      </div>

      <div className="card-border-gradient rounded-[20px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["User", "Role", "Status", "Created", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-sans font-medium text-[11px] text-white/50 uppercase tracking-[0.06em]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {userList.map((u: any, i: number) => (
              <tr key={i} className="user-row hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[rgba(58,42,238,0.15)] flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-white/60 font-semibold">
                        {(u.email || "U").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-sans font-normal text-[12px] text-white/80">{u.email}</p>
                      <p className="font-sans font-normal text-[10px] text-white/30">{u.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-sans font-medium text-[11px] text-white/50 capitalize">{u.role || "user"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize ${
                    u.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                    u.status === "suspended" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                    "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}>
                    {u.status || "active"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-sans font-normal text-[11px] text-white/40">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setSelectedUser(u); setDetailTab("info"); }}
                      className="w-7 h-7 rounded-[5px] bg-transparent border border-white/10 flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-white/40" />
                    </button>
                    <button
                      onClick={() => u.status === "suspended" ? unsuspendMutation.mutate({ id: u.id }) : suspendMutation.mutate({ id: u.id })}
                      className={`w-7 h-7 rounded-[5px] bg-transparent border flex items-center justify-center transition-colors cursor-pointer ${
                        u.status === "suspended"
                          ? "border-green-500/20 hover:bg-green-500/5"
                          : "border-yellow-500/20 hover:bg-yellow-500/5"
                      }`}
                      title={u.status === "suspended" ? "Unsuspend" : "Suspend"}
                    >
                      {u.status === "suspended" ? (
                        <RefreshCw className="w-3 h-3 text-green-400/60" />
                      ) : (
                        <UserX className="w-3 h-3 text-yellow-400/60" />
                      )}
                    </button>
                    <button
                      onClick={() => { if (confirm("Ban this user?")) banMutation.mutate({ id: u.id, reason: "Admin action" }); }}
                      className="w-7 h-7 rounded-[5px] bg-transparent border border-red-500/20 flex items-center justify-center hover:bg-red-500/5 transition-colors cursor-pointer"
                    >
                      <Ban className="w-3 h-3 text-red-400/60" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {userList.length === 0 && (
          <div className="py-10 text-center">
            <p className="font-sans font-normal text-[12px] text-white/30">No users found</p>
          </div>
        )}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-[5px] bg-transparent border border-white/10 text-white/40 font-sans font-normal text-[11px] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronLeft className="w-3 h-3" />
            Prev
          </button>
          <span className="font-sans font-normal text-[11px] text-white/30">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={userList.length < 20}
            className="flex items-center gap-1 px-3 py-1.5 rounded-[5px] bg-transparent border border-white/10 text-white/40 font-sans font-normal text-[11px] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            Next
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {selectedUser && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedUser(null); }}
        >
          <div className="w-full max-w-[640px] rounded-[20px] overflow-hidden" style={{ background: "rgba(17,16,24,0.95)", border: "1px solid rgba(58,42,238,0.2)" }}>
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="font-sans font-semibold text-white text-[18px]">User Details</h2>
              <button onClick={() => setSelectedUser(null)} className="w-8 h-8 rounded-full bg-transparent border border-white/10 flex items-center justify-center hover:bg-white/5 cursor-pointer transition-colors">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/50" /></svg>
              </button>
            </div>

            <div className="flex gap-2 px-6 pt-5">
              {(["info", "purchases", "transactions"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`px-5 py-2.5 rounded-[8px] font-sans font-medium text-[13px] capitalize cursor-pointer border-0 transition-all ${
                    detailTab === tab ? "bg-[rgba(58,42,238,0.2)] text-white" : "bg-transparent text-white/50 hover:text-white/80"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 max-h-[420px] overflow-y-auto">
              {detailTab === "info" && userDetail && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Email", value: (userDetail.user as any)?.email || "—" },
                      { label: "Role", value: (userDetail.user as any)?.role || "user" },
                      { label: "Status", value: (userDetail.user as any)?.status || "active" },
                      { label: "Balance", value: `${userDetail.balance} credits` },
                      { label: "ID", value: (userDetail.user as any)?.id || "—" },
                      { label: "Created", value: (userDetail.user as any)?.created_at ? new Date((userDetail.user as any).created_at).toLocaleDateString() : "—" },
                    ].map((field, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em]">{field.label}</span>
                        {field.label === "Role" ? (
                          <div className="flex items-center gap-2">
                            <span className="font-sans font-normal text-[14px] text-white/80 capitalize">{field.value}</span>
                            <select
                              value={(userDetail.user as any)?.role || "user"}
                              onChange={(e) => {
                                if (e.target.value !== (userDetail.user as any)?.role) {
                                  changeRoleMutation.mutate({ id: (userDetail.user as any)?.id, role: e.target.value as any });
                                }
                              }}
                              className="bg-[rgba(58,42,238,0.15)] border border-[rgba(58,42,238,0.3)] rounded-[6px] px-3 py-1.5 font-sans text-[12px] text-white/80 outline-none cursor-pointer hover:border-[rgba(58,42,238,0.5)] transition-colors"
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                              {currentUserIsOwner && <option value="owner">owner</option>}
                            </select>
                          </div>
                        ) : (
                          <span className="font-sans font-normal text-[14px] text-white/80 break-all">{field.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailTab === "purchases" && (
                <div className="flex flex-col gap-3">
                  {((userPurchases?.purchases || []) as any[]).length > 0 ? (
                    (userPurchases?.purchases as any[]).map((p: any, i: number) => (
                      <div key={i} className="p-4 rounded-[10px]" style={{ background: "rgba(58,42,238,0.06)", border: "1px solid rgba(58,42,238,0.12)" }}>
                        <p className="font-sans font-medium text-[14px] text-white/80">{p.item_name || p.itemId}</p>
                        <p className="font-sans font-normal text-[12px] text-white/40">{p.purchased_at ? new Date(p.purchased_at).toLocaleDateString() : ""}</p>
                      </div>
                    ))
                  ) : (
                    <p className="font-sans text-[14px] text-white/40 text-center py-6">No purchases</p>
                  )}
                </div>
              )}
              {detailTab === "transactions" && (
                <div className="flex flex-col gap-3">
                  {((userTransactions?.transactions || []) as any[]).length > 0 ? (
                    (userTransactions?.transactions as any[]).map((t: any, i: number) => (
                      <div key={i} className="p-4 rounded-[10px] flex justify-between items-center" style={{ background: "rgba(58,42,238,0.06)", border: "1px solid rgba(58,42,238,0.12)" }}>
                        <span className="font-sans font-normal text-[14px] text-white/70 capitalize">{t.transaction_type?.replace(/_/g, " ")}</span>
                        <span className={`font-sans font-semibold text-[14px] ${t.amount > 0 ? "text-[#05df72]" : "text-white/50"}`}>
                          {t.amount > 0 ? "+" : ""}{t.amount}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="font-sans text-[14px] text-white/40 text-center py-6">No transactions</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

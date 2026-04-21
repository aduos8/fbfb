import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { EyeOff, RefreshCw, Trash2, ShieldEllipsis } from "lucide-react";

export default function AdminRedactions() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [entityType, setEntityType] = useState<"user" | "channel" | "group">("user");
  const [entityId, setEntityId] = useState("");
  const [reason, setReason] = useState("");
  const [redactMode, setRedactMode] = useState<"full" | "partial" | "masked">("full");
  const [selectedFields, setSelectedFields] = useState<string[]>(["username", "bio"]);

  const { data, refetch } = trpc.admin.redactions.list.useQuery({ entityType });
  const fullRedactMutation = trpc.admin.redactions.fullRedact.useMutation({
    onSuccess: () => { toast.success("Entity redacted"); setEntityId(""); setReason(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const maskedRedactMutation = trpc.admin.redactions.maskedRedact.useMutation({
    onSuccess: () => { toast.success("Entity masked"); setEntityId(""); setReason(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const partialRedactMutation = trpc.admin.redactions.partialRedact.useMutation({
    onSuccess: () => { toast.success("Fields redacted"); setEntityId(""); setReason(""); setSelectedFields([]); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const removeRedactionMutation = trpc.admin.redactions.remove.useMutation({
    onSuccess: () => { toast.success("Redaction removed"); setViewingEntity(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deactivateMutation = trpc.admin.redactions.deactivate.useMutation({
    onSuccess: () => { toast.success("Redaction deactivated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMutation = trpc.admin.redactions.reactivate.useMutation({
    onSuccess: () => { toast.success("Redaction reactivated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [viewingEntity, setViewingEntity] = useState<any>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".redactions-title", { filter: "blur(10px)", opacity: 0, y: 24 });
      gsap.set(".redaction-card", { filter: "blur(8px)", opacity: 0, y: 16 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".redactions-title", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.1)
        .to(".redaction-card", { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, 0.3);
    }, contentRef);
    return () => ctx.revert();
  }, []);

  const redactionList = (data?.redactions || []) as any[];
  const inputCls = "w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 outline-none font-sans text-[14px] text-white/80 placeholder:text-white/30 transition-colors focus:border-[rgba(239,68,68,0.4)]";
  const labelCls = "block font-sans font-semibold text-[11px] text-white/50 uppercase tracking-[0.06em] mb-2";

  const fieldOptions = ["username", "displayName", "bio", "profilePhoto", "phone", "messages", "groups", "channels"];

  return (
    <div ref={contentRef}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="redactions-title font-sans font-semibold text-white text-[28px] sm:text-[32px] md:text-[35px] leading-none">
            Data <span className="font-handwriting text-[#ff4a4a]">Redactions</span>
          </h1>
          <p className="font-sans text-[13px] text-white/40 mt-2">Manage entity visibility and privacy controls</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-transparent border border-white/10 text-white/60 font-sans text-[12px] hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="redaction-card rounded-[20px] p-6 md:p-8" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-[10px] bg-[rgba(239,68,68,0.15)] flex items-center justify-center">
              <ShieldEllipsis className="w-5 h-5 text-[#ff4a4a]" />
            </div>
            <div>
              <h2 className="font-sans font-semibold text-white text-[15px] md:text-[17px]">Create Redaction</h2>
              <p className="font-sans text-[11px] text-white/40 mt-0.5">Hide data from search and exports</p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <label className={labelCls}>Entity type</label>
              <div className="flex gap-2">
                {(["user", "channel", "group"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEntityType(type)}
                    className={`flex-1 px-4 py-2.5 rounded-[10px] font-sans font-medium text-[12px] capitalize cursor-pointer border-0 transition-all ${
                      entityType === type ? "bg-[rgba(239,68,68,0.2)] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.1)]" : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Entity ID</label>
              <input type="text" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="e.g. 12345678" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Redaction mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRedactMode("full")}
                  className={`flex-1 px-4 py-3 rounded-[10px] font-sans font-medium text-[12px] cursor-pointer border-0 transition-all ${
                    redactMode === "full" ? "bg-[rgba(239,68,68,0.2)] text-white" : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  Full Redact
                </button>
                <button
                  onClick={() => setRedactMode("masked")}
                  className={`flex-1 px-4 py-3 rounded-[10px] font-sans font-medium text-[12px] cursor-pointer border-0 transition-all ${
                    redactMode === "masked" ? "bg-[rgba(255,255,255,0.15)] text-white" : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  Masked
                </button>
                <button
                  onClick={() => setRedactMode("partial")}
                  className={`flex-1 px-4 py-3 rounded-[10px] font-sans font-medium text-[12px] cursor-pointer border-0 transition-all ${
                    redactMode === "partial" ? "bg-[rgba(239,68,68,0.2)] text-white" : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  Partial
                </button>
              </div>
            </div>

            {redactMode === "partial" && (
              <div>
                <label className={labelCls}>Fields to redact</label>
                <div className="flex flex-wrap gap-2">
                  {fieldOptions.map((field) => (
                    <button
                      key={field}
                      onClick={() => setSelectedFields((prev) =>
                        prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
                      )}
                      className={`px-4 py-2 rounded-[8px] font-sans font-normal text-[12px] cursor-pointer border-0 transition-all ${
                        selectedFields.includes(field) ? "bg-[rgba(239,68,68,0.2)] text-white" : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/10"
                      }`}
                    >
                      {field}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Reason (required)</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Legal request, privacy, etc." className={inputCls} />
            </div>

            <button
              onClick={() => {
                if (!entityId || !reason) { toast.error("Entity ID and reason are required"); return; }
                if (redactMode === "full") {
                  fullRedactMutation.mutate({ entityType, entityId, reason });
                } else if (redactMode === "masked") {
                  maskedRedactMutation.mutate({ entityType, entityId, reason });
                } else {
                  partialRedactMutation.mutate({ entityType, entityId, fields: selectedFields, reason });
                }
              }}
              disabled={!entityId || !reason || fullRedactMutation.isPending || maskedRedactMutation.isPending || partialRedactMutation.isPending}
              className="w-full h-[48px] rounded-[12px] bg-[#ff4a4a] text-white font-sans font-semibold text-[14px] hover:bg-[#ff5a5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-0"
            >
              <EyeOff className="w-4 h-4" />
              {fullRedactMutation.isPending || maskedRedactMutation.isPending || partialRedactMutation.isPending ? "Processing..." : redactMode === "full" ? "Full Redact" : redactMode === "masked" ? "Mask" : "Partial Redact"}
            </button>
          </div>
        </div>

        <div className="redaction-card card-border-gradient rounded-[20px] p-6 md:p-8">
          <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-5">How Redactions Work</h2>
          <div className="flex flex-col gap-4">
            {[
              { title: "Full Redact", desc: "Completely hides an entity from all search results, analytics, and exports." },
              { title: "Masked", desc: "Shows a 'Record unavailable' placeholder. User appears in search but data is hidden." },
              { title: "Partial Redact", desc: "Hides specific fields like username, display name, profile photo, phone, messages, groups, or channels." },
              { title: "Server Enforcement", desc: "Redactions are enforced server-side across all API responses, search results, and data exports." },
              { title: "Deactivate / Reactivate", desc: "Temporarily disable a redaction without deleting it. Data remains hidden until reactivated." },
              { title: "Undo Redactions", desc: "Remove redactions permanently from the list below. Data is restored immediately." },
            ].map((info, i) => (
              <div key={i} className="p-4 rounded-[12px]" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
                <p className="font-sans font-medium text-[13px] text-white/80 mb-1">{info.title}</p>
                <p className="font-sans font-normal text-[12px] text-white/40 leading-relaxed">{info.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RedactionsTable
        redactionList={redactionList}
        entityType={entityType}
        setEntityType={setEntityType}
        deactivateMutation={deactivateMutation}
        reactivateMutation={reactivateMutation}
        removeRedactionMutation={removeRedactionMutation}
      />
    </div>
  );
}

function getTypeBadgeClass(type: string) {
  if (type === "full") return "bg-[rgba(239,68,68,0.15)] text-[#ff4a4a] border-[rgba(239,68,68,0.2)]";
  if (type === "masked") return "bg-[rgba(255,255,255,0.1)] text-white/60 border-[rgba(255,255,255,0.15)]";
  return "bg-[rgba(251,146,60,0.15)] text-[#fb923c] border-[rgba(251,146,60,0.2)]";
}

function getStatusBadgeClass(isActive: boolean) {
  if (isActive) return "bg-[rgba(34,197,94,0.15)] text-[#22c55e] border-[rgba(34,197,94,0.2)]";
  return "bg-[rgba(251,146,60,0.15)] text-[#fb923c] border-[rgba(251,146,60,0.2)]";
}

function RedactionsTable({ redactionList, entityType, setEntityType, deactivateMutation, reactivateMutation, removeRedactionMutation }: {
  redactionList: any[];
  entityType: "user" | "channel" | "group";
  setEntityType: (type: "user" | "channel" | "group") => void;
  deactivateMutation: any;
  reactivateMutation: any;
  removeRedactionMutation: any;
}) {
  return (
    <div className="redaction-card card-border-gradient rounded-[20px] overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Active Redactions</h2>
        <div className="flex gap-1">
          {(["user", "channel", "group"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setEntityType(type)}
              className={`px-4 py-2 rounded-[8px] font-sans font-medium text-[12px] capitalize cursor-pointer border-0 transition-all ${
                entityType === type ? "bg-[rgba(239,68,68,0.2)] text-white" : "bg-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {type}s
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Entity ID", "Type", "Fields", "Status", "Reason", "Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-4 text-left font-sans font-medium text-[11px] text-white/50 uppercase tracking-[0.06em] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {redactionList.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-4">
                  <span className="font-mono text-[11px] text-white/40 break-all">{r.entity_id || "—"}</span>
                </td>
                <td className="px-4 py-4">
                  <span className={"inline-block px-3 py-1 rounded-full text-[10px] font-semibold border capitalize whitespace-nowrap " + getTypeBadgeClass(r.redaction_type)}>{r.redaction_type}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="font-sans font-normal text-[12px] text-white/50 whitespace-nowrap">
                    {r.redaction_type === "masked" ? "All fields" : r.fields?.join(", ") || "All fields"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={"inline-block px-3 py-1 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap border " + getStatusBadgeClass(r.is_active !== false)}>
                    {r.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-4 min-w-[150px] max-w-[200px]">
                  <span className="font-sans font-normal text-[11px] text-white/30 line-clamp-2">{r.reason || "—"}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className="font-sans font-normal text-[12px] text-white/40">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.is_active !== false ? (
                      <button
                        onClick={() => deactivateMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                        disabled={deactivateMutation.isPending}
                        className="px-2.5 py-1 rounded-[6px] bg-transparent border border-[#fb923c]/20 text-[#fb923c]/70 font-sans font-medium text-[10px] whitespace-nowrap hover:bg-[#fb923c]/5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivateMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                        disabled={reactivateMutation.isPending}
                        className="px-2.5 py-1 rounded-[6px] bg-transparent border border-[#22c55e]/20 text-[#22c55e]/70 font-sans font-medium text-[10px] whitespace-nowrap hover:bg-[#22c55e]/5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                    <button
                      onClick={() => removeRedactionMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                      disabled={removeRedactionMutation.isPending}
                      className="px-2.5 py-1 rounded-[6px] bg-transparent border border-[#ff4a4a]/20 text-[#ff4a4a]/70 font-sans font-medium text-[10px] whitespace-nowrap hover:bg-[#ff4a4a]/5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3 inline-block mr-1" />
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-white/[0.04]">
        {redactionList.map((r: any, i: number) => (
          <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={"px-2.5 py-1 rounded-full text-[10px] font-semibold border capitalize whitespace-nowrap " + getTypeBadgeClass(r.redaction_type)}>{r.redaction_type}</span>
                <span className={"px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap border " + getStatusBadgeClass(r.is_active !== false)}>
                  {r.is_active !== false ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {r.is_active !== false ? (
                  <button
                    onClick={() => deactivateMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                    disabled={deactivateMutation.isPending}
                    className="px-2 py-1 rounded-[6px] bg-transparent border border-[#fb923c]/20 text-[#fb923c]/70 font-sans font-medium text-[10px] whitespace-nowrap hover:bg-[#fb923c]/5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Deact
                  </button>
                ) : (
                  <button
                    onClick={() => reactivateMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                    disabled={reactivateMutation.isPending}
                    className="px-2 py-1 rounded-[6px] bg-transparent border border-[#22c55e]/20 text-[#22c55e]/70 font-sans font-medium text-[10px] whitespace-nowrap hover:bg-[#22c55e]/5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    React
                  </button>
                )}
                <button
                  onClick={() => removeRedactionMutation.mutate({ entityType: r.entity_type, entityId: r.entity_id })}
                  disabled={removeRedactionMutation.isPending}
                  className="p-1.5 rounded-[6px] bg-transparent border border-[#ff4a4a]/20 text-[#ff4a4a]/70 hover:bg-[#ff4a4a]/5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-sans text-[10px] text-white/40 uppercase tracking-wider">Entity ID</span>
                <span className="font-mono text-[11px] text-white/60 text-right break-all max-w-[60%]">{r.entity_id || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-sans text-[10px] text-white/40 uppercase tracking-wider">Fields</span>
                <span className="font-sans text-[11px] text-white/60 text-right max-w-[60%] line-clamp-2">
                  {r.redaction_type === "masked" ? "All fields" : r.fields?.join(", ") || "All fields"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-sans text-[10px] text-white/40 uppercase tracking-wider">Reason</span>
                <span className="font-sans text-[11px] text-white/50 text-right max-w-[60%] line-clamp-2">{r.reason || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-sans text-[10px] text-white/40 uppercase tracking-wider">Date</span>
                <span className="font-sans text-[11px] text-white/50">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {redactionList.length === 0 && (
        <div className="py-16 text-center">
          <ShieldEllipsis className="w-10 h-10 text-white/15 mx-auto mb-4" />
          <p className="font-sans font-normal text-[13px] text-white/30">No active redactions</p>
        </div>
      )}
    </div>
  );
}

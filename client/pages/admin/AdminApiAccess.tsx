import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Check, KeyRound, Search, ShieldCheck, ShieldOff, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

type PlanType = "basic" | "intermediate" | "advanced";
type OverrideMode = "default" | "allow" | "block";

const plans: { id: PlanType; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const modes: { id: OverrideMode; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "allow", label: "Allow" },
  { id: "block", label: "Block" },
];

export default function AdminApiAccess() {
  const utils = trpc.useUtils();
  const [selectedPlans, setSelectedPlans] = useState<PlanType[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [settingsTouched, setSettingsTouched] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [mode, setMode] = useState<OverrideMode>("default");
  const [reason, setReason] = useState("");

  const { data, isLoading } = trpc.admin.apiAccess.getSettings.useQuery();

  const { data: userResults } = trpc.admin.users.search.useQuery(
    { query, limit: 8 },
    { enabled: query.trim().length >= 2 }
  );

  const updateSettings = trpc.admin.apiAccess.updateSettings.useMutation({
    onSuccess: async () => {
      await utils.admin.apiAccess.getSettings.invalidate();
      setSettingsTouched(false);
      toast.success("API access settings saved");
    },
    onError: (error) => toast.error(error.message),
  });

  const setOverride = trpc.admin.apiAccess.setUserOverride.useMutation({
    onSuccess: async () => {
      await utils.admin.apiAccess.getSettings.invalidate();
      setSelectedUserId("");
      setMode("default");
      setReason("");
      toast.success("User API access override saved");
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedUser = useMemo(
    () => userResults?.users.find((user) => user.id === selectedUserId),
    [selectedUserId, userResults?.users]
  );

  const togglePlan = (plan: PlanType) => {
    setSettingsTouched(true);
    setSelectedPlans((current) =>
      current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan]
    );
  };

  const saveSettings = () => {
    updateSettings.mutate({ enabled, allowedPlanTypes: selectedPlans });
  };

  const saveOverride = () => {
    if (!selectedUserId) {
      toast.error("Select a user first");
      return;
    }
    setOverride.mutate({
      userId: selectedUserId,
      mode,
      reason: reason.trim() || undefined,
    });
  };

  const overrides = data?.overrides ?? [];

  useEffect(() => {
    if (!data || settingsTouched) return;
    setEnabled(data.settings.enabled);
    setSelectedPlans(data.settings.allowed_plan_types as PlanType[]);
  }, [data, settingsTouched]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-sans text-[11px] text-white/40 uppercase tracking-[0.1em] mb-2">Admin Controls</p>
        <h1 className="font-sans font-normal text-[28px] md:text-[35px] text-white leading-none">
          API <span className="font-handwriting text-[#3A2AEE] text-[34px] md:text-[42px]">Access</span>
        </h1>
        <p className="font-sans text-[13px] text-white/50 mt-3 max-w-3xl">
          Control which plans and users can create account-linked API keys. Changes are written to the audit log.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
        <div className="card-border-gradient rounded-[20px] p-6">
          <div className="flex items-center gap-3 mb-5">
            <SlidersHorizontal className="w-5 h-5 text-[#3A2AEE]" />
            <h2 className="font-sans font-semibold text-[17px] text-white">Global Settings</h2>
          </div>

          <label className="flex items-center justify-between gap-4 py-4 border-b border-white/[0.06] cursor-pointer">
            <span>
              <span className="block font-sans text-[13px] text-white/85">Public API enabled</span>
              <span className="block font-sans text-[12px] text-white/40 mt-1">Disabling blocks all non-admin API key use.</span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
                setSettingsTouched(true);
              }}
              className="h-4 w-4 accent-[#3A2AEE]"
            />
          </label>

          <div className="py-4">
            <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35 mb-3">Allowed Plans</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.map((plan) => {
                const active = selectedPlans.includes(plan.id);
                return (
                  <button
                    key={plan.id}
                    onClick={() => togglePlan(plan.id)}
                    className={`h-11 rounded-[10px] border font-sans text-[12px] transition-colors ${
                      active
                        ? "border-[#3A2AEE]/70 bg-[#3A2AEE]/20 text-white"
                        : "border-white/10 bg-white/[0.02] text-white/45 hover:text-white/70"
                    }`}
                  >
                    {plan.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={saveSettings}
            disabled={updateSettings.isPending || isLoading || selectedPlans.length === 0}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-[#3A2AEE] text-white font-sans text-[13px] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] hover:bg-[#4a3aff] disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {updateSettings.isPending ? "Saving" : "Save Settings"}
          </button>
        </div>

        <div className="card-border-gradient rounded-[20px] p-6">
          <div className="flex items-center gap-3 mb-5">
            <KeyRound className="w-5 h-5 text-[#3A2AEE]" />
            <h2 className="font-sans font-semibold text-[17px] text-white">User Override</h2>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-[#232327] border border-white/10 rounded-[10px] h-[42px] pl-10 pr-4 outline-none font-sans text-[13px] text-white/80 placeholder:text-white/25 input-glow"
              placeholder="Search users by email"
            />
          </div>

          {userResults?.users.length ? (
            <div className="mt-3 max-h-[180px] overflow-auto rounded-[10px] border border-white/[0.06]">
              {userResults.users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b border-white/[0.04] last:border-b-0 ${
                    selectedUserId === user.id ? "bg-[#3A2AEE]/15" : "bg-white/[0.015] hover:bg-white/[0.035]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-sans text-[13px] text-white/80 truncate">{user.email}</span>
                    <span className="block font-sans text-[11px] text-white/35 mt-1">{user.role} · {user.status}</span>
                  </span>
                  <span className="font-mono text-[11px] text-white/35">{user.balance} cr</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as OverrideMode)}
              className="bg-[#232327] border border-white/10 rounded-[10px] h-[42px] px-3 outline-none font-sans text-[13px] text-white/80"
            >
              {modes.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="bg-[#232327] border border-white/10 rounded-[10px] h-[42px] px-3 outline-none font-sans text-[13px] text-white/80 placeholder:text-white/25"
              placeholder="Reason"
            />
          </div>

          <div className="flex items-center justify-between gap-4 mt-4">
            <p className="min-w-0 font-sans text-[12px] text-white/45 truncate">
              {selectedUser ? selectedUser.email : "No user selected"}
            </p>
            <button
              onClick={saveOverride}
              disabled={setOverride.isPending || !selectedUserId}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-[#3A2AEE] text-white font-sans text-[13px] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] hover:bg-[#4a3aff] disabled:opacity-50"
            >
              {setOverride.isPending ? "Saving" : "Save Override"}
            </button>
          </div>
        </div>
      </div>

      <div className="card-border-gradient rounded-[20px] overflow-hidden">
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#3A2AEE]" />
          <h2 className="font-sans font-semibold text-[17px] text-white">Current Overrides</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {overrides.length > 0 ? overrides.map((override) => (
            <div key={override.user_id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
              <div className="col-span-12 md:col-span-5 min-w-0">
                <p className="font-sans text-[13px] text-white/85 truncate">{override.email}</p>
                <p className="font-mono text-[11px] text-white/30 mt-1">{override.user_id}</p>
              </div>
              <div className="col-span-6 md:col-span-2">
                <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Mode</p>
                <p className={`font-sans text-[12px] mt-1 ${override.mode === "block" ? "text-[#ff8a8a]" : override.mode === "allow" ? "text-[#05df72]" : "text-white/60"}`}>
                  {override.mode}
                </p>
              </div>
              <div className="col-span-6 md:col-span-2">
                <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Updated</p>
                <p className="font-sans text-[12px] text-white/60 mt-1">{new Date(override.updated_at).toLocaleDateString("en-GB")}</p>
              </div>
              <div className="col-span-12 md:col-span-3 min-w-0">
                <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Reason</p>
                <p className="font-sans text-[12px] text-white/55 mt-1 truncate">{override.reason || "No reason provided"}</p>
              </div>
            </div>
          )) : (
            <div className="px-6 py-12 text-center">
              <ShieldOff className="w-5 h-5 text-white/25 mx-auto mb-3" />
              <p className="font-sans text-[13px] text-white/40">No user overrides configured</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

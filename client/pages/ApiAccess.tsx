import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";

export default function ApiAccess() {
  const [keyName, setKeyName] = useState("Website integration");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const utils = trpc.useUtils();

  const { data: access, isLoading: accessLoading } = trpc.account.getApiAccess.useQuery();
  const { data: keysData } = trpc.account.listApiKeys.useQuery();

  const createKey = trpc.account.createApiKey.useMutation({
    onSuccess: async (data) => {
      setRevealedKey(data.key);
      setKeyName("Website integration");
      await utils.account.listApiKeys.invalidate();
      toast.success("API key created");
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeKey = trpc.account.revokeApiKey.useMutation({
    onSuccess: async () => {
      await utils.account.listApiKeys.invalidate();
      toast.success("API key revoked");
    },
    onError: (error) => toast.error(error.message),
  });

  const copyKey = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const keys = keysData?.keys ?? [];
  const allowed = access?.allowed ?? false;

  return (
    <div className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-0 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[32px] md:rounded-b-[50px] overflow-hidden flex max-w-full flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div className="nav-float">
          <Navbar />
        </div>

        <div className="max-w-full px-5 sm:px-8 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-7">
          <div>
            <p className="font-sans text-[11px] text-white/40 uppercase tracking-[0.1em] mb-2">Developer Access</p>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              API <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">Keys</span>
            </h1>
            <p className="font-sans text-[13px] sm:text-[14px] text-white/50 mt-3">
              Create account-linked keys for your own tools and websites. Searches spend credits from this account.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
            <div className="card-border-gradient rounded-[20px] p-5 md:p-8">
              <div className="flex items-center gap-3 mb-5">
                <ShieldCheck className={allowed ? "w-5 h-5 text-[#05df72]" : "w-5 h-5 text-[#ff8a8a]"} />
                <h2 className="font-sans font-semibold text-[17px] text-white">Access Status</h2>
              </div>
              <p className={`font-sans text-[28px] font-semibold ${allowed ? "text-[#05df72]" : "text-[#ff8a8a]"}`}>
                {accessLoading ? "Checking" : allowed ? "Enabled" : "Unavailable"}
              </p>
              <p className="font-sans text-[13px] text-white/50 mt-3">{access?.reason ?? "Checking your current API eligibility."}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/api-docs" className="inline-flex px-4 py-2 rounded-[10px] border border-white/10 text-white/65 text-[12px] hover:bg-white/[0.04] transition-colors">
                  View documentation
                </Link>
                <Link to="/api-agents" className="inline-flex px-4 py-2 rounded-[10px] border border-white/10 text-white/65 text-[12px] hover:bg-white/[0.04] transition-colors">
                  Copy AGENTS.md
                </Link>
              </div>
            </div>

            <div className="card-border-gradient rounded-[20px] p-5 md:p-8">
              <h2 className="font-sans font-semibold text-[17px] text-white mb-5">Create Key</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  disabled={!allowed}
                  maxLength={120}
                  className="flex-1 bg-[#232327] border border-white/10 rounded-[10px] h-[44px] px-4 outline-none font-sans text-[13px] text-white/80 placeholder:text-white/25 input-glow disabled:opacity-50"
                  placeholder="Key name"
                />
                <button
                  onClick={() => createKey.mutate({ name: keyName })}
                  disabled={!allowed || createKey.isPending || keyName.trim().length === 0}
                  className="inline-flex items-center justify-center gap-2 h-[44px] px-5 rounded-[10px] bg-[#3A2AEE] text-white font-sans text-[13px] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] hover:bg-[#4a3aff] disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {createKey.isPending ? "Creating" : "Create"}
                </button>
              </div>

              {revealedKey && (
                <div className="mt-5 rounded-[12px] border border-[#05df72]/20 bg-[#05df72]/[0.05] p-4">
                  <p className="font-sans text-[12px] text-[#05df72] mb-2">Copy this key now. It will not be shown again.</p>
                  <div className="flex items-center gap-3">
                    <code className="min-w-0 flex-1 truncate rounded-[8px] bg-black/25 px-3 py-2 font-mono text-[12px] text-white/80">{revealedKey}</code>
                    <button onClick={copyKey} className="h-9 w-9 rounded-[8px] border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/55 hover:text-white">
                      {copied ? <Check className="w-4 h-4 text-[#05df72]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card-border-gradient rounded-[20px] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-[#3A2AEE]" />
              <h2 className="font-sans font-semibold text-[17px] text-white">Active Keys</h2>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {keys.length > 0 ? keys.map((key) => (
                <div key={key.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                  <div className="col-span-12 md:col-span-5 min-w-0">
                    <p className="font-sans text-[13px] text-white/85 truncate">{key.name}</p>
                    <p className="font-mono text-[11px] text-white/35 mt-1">{key.key_prefix}...</p>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Created</p>
                    <p className="font-sans text-[12px] text-white/60 mt-1">{new Date(key.created_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Last Used</p>
                    <p className="font-sans text-[12px] text-white/60 mt-1">{key.last_used_at ? new Date(key.last_used_at).toLocaleString("en-GB") : "Never"}</p>
                  </div>
                  <div className="col-span-12 md:col-span-1 flex md:justify-end">
                    <button
                      onClick={() => revokeKey.mutate({ id: key.id })}
                      disabled={revokeKey.isPending || !!key.revoked_at}
                      className="h-9 w-9 rounded-[8px] border border-red-500/20 bg-transparent flex items-center justify-center text-red-400/70 hover:bg-red-500/10 disabled:opacity-40"
                      aria-label="Revoke API key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="px-6 py-12 text-center">
                  <p className="font-sans text-[13px] text-white/40">No API keys yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

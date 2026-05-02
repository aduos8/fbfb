import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BookOpen, Check, Copy, KeyRound, Sparkles } from "lucide-react";
import { buildPublicApiAgentsTemplate } from "@/lib/publicApiAgents";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "https://example.com";

function CopyTemplateButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-[10px] bg-[#3A2AEE] px-4 py-2.5 font-sans text-[12px] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] transition-colors hover:bg-[#4a3aff]"
    >
      {copied ? <Check className="h-4 w-4 text-[#05df72]" /> : <Copy className="h-4 w-4" />}
      <span>{copied ? "Copied" : "Copy AGENTS.md"}</span>
    </button>
  );
}

function StatCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="font-sans text-[11px] uppercase tracking-[0.1em] text-white/35">{title}</p>
      <p className="mt-2 font-sans text-[12px] leading-6 text-white/60">{body}</p>
    </div>
  );
}

export default function ApiAgents() {
  const template = useMemo(() => buildPublicApiAgentsTemplate(API_BASE), []);

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

        <div className="max-w-full px-5 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-7">
          <div>
            <p className="font-sans text-[11px] text-white/40 uppercase tracking-[0.1em] mb-2">AI Integration Guide</p>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              AGENTS.md <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">Guide</span>
            </h1>
            <p className="mt-3 max-w-[calc(100vw-2.5rem)] sm:max-w-3xl font-sans text-[13px] sm:text-[14px] leading-6 text-white/55">
              Copy a ready-made AGENTS.md reference that another AI assistant can use to integrate this API into a separate app. It is intentionally brand-neutral in the key naming, but it uses this site&apos;s current domain in the request examples.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <CopyTemplateButton value={template} />
              <Link
                to="/api-docs"
                className="inline-flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-2.5 font-sans text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <BookOpen className="h-4 w-4" />
                Back to API docs
              </Link>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="What it is for" body="A concise repo-local brief you can hand to another AI so it implements against the stable public API instead of guessing." />
            <StatCard title="What to replace" body="Swap in your own env-var naming if you want, then drop the file into the target app repo as AGENTS.md." />
            <StatCard title="What it enforces" body="Stable endpoints, secret handling, page-1 credit semantics, retry discipline, and respect for redacted responses." />
          </div>

          <div className="card-border-gradient min-w-0 rounded-[20px] p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-[#3A2AEE]">Copy-Ready Artifact</p>
                <h2 className="mt-2 font-sans text-[20px] font-semibold text-white">Drop this into another repo as AGENTS.md</h2>
              </div>
              <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-white/60">
                Base URL in this template: <span className="font-mono text-white/80">{API_BASE}</span>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#0d0d12]">
              <pre className="m-0 max-h-[720px] w-full max-w-full overflow-auto p-5 text-[12px] leading-6 text-white/75">
                <code>{template}</code>
              </pre>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="card-border-gradient rounded-[20px] p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[#3A2AEE]" />
                <h2 className="font-sans text-[17px] font-semibold text-white">What this tells another AI to do</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Use the stable search and credits endpoints exactly as they exist.",
                  "Treat the API key as a secret and keep it out of logs and source control.",
                  "Avoid duplicate page-1 searches that could double-trigger user actions.",
                  "Handle stable error codes and Retry-After cleanly.",
                  "Respect redactions instead of trying to infer hidden content.",
                ].map((item) => (
                  <div key={item} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 font-sans text-[12px] leading-6 text-white/60">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="card-border-gradient rounded-[20px] p-6">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-[#3A2AEE]" />
                <h2 className="font-sans text-[17px] font-semibold text-white">Before you hand it off</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Replace YOUR_API_KEY with the env-var name you want in the target repo, if needed.",
                  `Confirm the target app should call ${API_BASE} directly.`,
                  "Keep the file focused on integration behavior, not on unrelated product rules in the target app.",
                  "Pair this page with /api-docs if the implementer also needs filter tables and live examples.",
                ].map((item) => (
                  <div key={item} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 font-sans text-[12px] leading-6 text-white/60">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

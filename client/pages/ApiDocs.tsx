import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Play,
  Search,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import {
  buildExampleSnippets,
  buildExplorerCurlSnippet,
  buildExplorerFetchSnippet,
  createDefaultSearchRequest,
  DOC_OVERVIEW_CARDS,
  DOC_SECTIONS,
  ENDPOINT_REFERENCES,
  ERROR_REFERENCE,
  FILTER_REFERENCE,
  normalizeExplorerApiKey,
  SEARCH_REQUEST_FIELDS,
  SUCCESS_RESPONSE_EXAMPLES,
  type PublicApiAuthMode,
  type PublicApiExplorerEndpoint,
  type PublicApiSearchType,
} from "@/lib/publicApiDocs";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "https://example.com";

type ExplorerResponseState = {
  status: number;
  ok: boolean;
  retryAfter: string | null;
  body: unknown;
};

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
      aria-label={label}
    >
      {copied ? <Check className="h-4 w-4 text-[#05df72]" /> : <Copy className="h-4 w-4" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

function SectionTitle({ eyebrow, title, body, id }: { eyebrow: string; title: string; body: string; id: string }) {
  return (
    <div id={id} className="scroll-mt-24">
      <p className="font-sans text-[11px] uppercase tracking-[0.12em] text-white/35">{eyebrow}</p>
      <h2 className="mt-2 font-sans text-[22px] font-semibold text-white">{title}</h2>
      <p className="mt-3 max-w-[calc(100vw-5rem)] sm:max-w-3xl font-sans text-[13px] leading-6 text-white/55">{body}</p>
    </div>
  );
}

function DocsTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number | boolean>>;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-black/15">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left font-sans text-[11px] uppercase tracking-[0.1em] text-white/40">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-top font-sans text-[12px] leading-6 text-white/70">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeCard({ title, label, code }: { title: string; label: string; code: string }) {
  return (
    <div className="card-border-gradient min-w-0 overflow-hidden rounded-[20px]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-[#3A2AEE]">{label}</p>
          <h3 className="mt-1 font-sans text-[15px] font-semibold text-white">{title}</h3>
        </div>
        <CopyButton value={code} label="Copy code" />
      </div>
      <pre className="m-0 max-h-[360px] w-full max-w-full overflow-auto bg-[#0d0d12] p-5 text-[12px] leading-6 text-white/72">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function ApiDocs() {
  const [endpoint, setEndpoint] = useState<PublicApiExplorerEndpoint>("search");
  const [authMode, setAuthMode] = useState<PublicApiAuthMode>("x-api-key");
  const [searchType, setSearchType] = useState<PublicApiSearchType>("profile");
  const [apiKey, setApiKey] = useState("");
  const [requestBodyText, setRequestBodyText] = useState(() => formatJson(createDefaultSearchRequest("profile")));
  const [responseState, setResponseState] = useState<ExplorerResponseState | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const snippets = useMemo(() => buildExampleSnippets(API_BASE), []);

  const generatedCurl = useMemo(() => {
    let searchBody = createDefaultSearchRequest(searchType);

    if (endpoint === "search") {
      try {
        searchBody = JSON.parse(requestBodyText) as typeof searchBody;
      } catch {
        // Keep a valid snippet even while the user is editing malformed JSON.
      }
    }

    return buildExplorerCurlSnippet({
      apiBase: API_BASE,
      apiKey,
      endpoint,
      authMode,
      searchBody,
    });
  }, [apiKey, authMode, endpoint, requestBodyText, searchType]);

  const generatedFetch = useMemo(() => {
    let searchBody = createDefaultSearchRequest(searchType);

    if (endpoint === "search") {
      try {
        searchBody = JSON.parse(requestBodyText) as typeof searchBody;
      } catch {
        // Keep a valid snippet even while the user is editing malformed JSON.
      }
    }

    return buildExplorerFetchSnippet({
      apiBase: API_BASE,
      apiKey,
      endpoint,
      authMode,
      searchBody,
    });
  }, [apiKey, authMode, endpoint, requestBodyText, searchType]);

  const handleSearchTypeChange = (type: PublicApiSearchType) => {
    setSearchType(type);
    setRequestBodyText(formatJson(createDefaultSearchRequest(type)));
    setRequestError(null);
  };

  const handleSendRequest = async () => {
    const trimmedKey = normalizeExplorerApiKey(apiKey);
    if (!trimmedKey) {
      setRequestError("Paste an API key before sending a live request.");
      return;
    }

    let parsedBody: unknown = null;
    if (endpoint === "search") {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "Request body must be valid JSON.");
        return;
      }
    }

    setRequestError(null);
    setIsRunning(true);

    try {
      const headers: Record<string, string> = authMode === "bearer"
        ? { Authorization: `Bearer ${trimmedKey}` }
        : { "X-API-Key": trimmedKey };

      if (endpoint === "search") {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(
        endpoint === "search" ? `${API_BASE}/api/v1/search` : `${API_BASE}/api/v1/credits`,
        {
          method: endpoint === "search" ? "POST" : "GET",
          headers,
          body: endpoint === "search" ? JSON.stringify(parsedBody) : undefined,
        },
      );

      const raw = await response.text();
      let body: unknown = raw;

      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }

      setResponseState({
        status: response.status,
        ok: response.ok,
        retryAfter: response.headers.get("Retry-After"),
        body,
      });
    } catch (error) {
      setResponseState({
        status: 0,
        ok: false,
        retryAfter: null,
        body: {
          error: error instanceof Error ? error.message : "Request failed",
          code: "network_error",
        },
      });
    } finally {
      setIsRunning(false);
    }
  };

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

        <div className="max-w-full px-5 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-8">
            <div className="flex min-w-0 flex-col gap-7">
              <div id="overview" className="scroll-mt-24">
                <p className="font-sans text-[11px] text-white/40 uppercase tracking-[0.1em] mb-2">Developer Platform</p>
                <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
                  API <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">Docs</span>
                </h1>
                <p className="mt-3 max-w-[calc(100vw-2.5rem)] sm:max-w-3xl font-sans text-[13px] sm:text-[14px] leading-6 text-white/55">
                  Production reference for the public search API, including authentication, charge semantics, filter aliases, error codes, and a same-origin live explorer. All examples below use the current domain and neutral placeholder key names.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/api-access"
                    className="inline-flex items-center gap-2 rounded-[10px] bg-[#3A2AEE] px-4 py-2.5 font-sans text-[12px] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] transition-colors hover:bg-[#4a3aff]"
                  >
                    <KeyRound className="h-4 w-4" />
                    Get API keys
                  </Link>
                  <Link
                    to="/api-agents"
                    className="inline-flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-2.5 font-sans text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <BookOpen className="h-4 w-4" />
                    Copy AGENTS.md guide
                  </Link>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
                {DOC_OVERVIEW_CARDS.map((item, index) => {
                  const Icon = index === 0 ? KeyRound : index === 1 ? Search : WalletCards;
                  return (
                    <div key={item.label} className="card-border-gradient rounded-[20px] p-5">
                      <Icon className="mb-4 h-5 w-5 text-[#3A2AEE]" />
                      <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/40">{item.label}</p>
                      <p className="mt-2 font-sans text-[15px] text-white/90">{item.value}</p>
                      <p className="mt-2 font-sans text-[12px] leading-6 text-white/50">{item.detail}</p>
                    </div>
                  );
                })}
              </div>

              <SectionTitle
                id="authentication"
                eyebrow="Authentication"
                title="Send the same account-linked key in either supported header."
                body="The public API accepts X-API-Key and Authorization: Bearer. Access policy and rate limiting are enforced before search execution. Keys spend credits from the key owner, so avoid duplicate page-1 requests."
              />

              <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
                <CodeCard title="X-API-Key header" label="HTTP" code={`X-API-Key: your_api_key`} />
                <CodeCard title="Bearer token header" label="HTTP" code={`Authorization: Bearer your_api_key`} />
              </div>

              <SectionTitle
                id="credits"
                eyebrow="Credits"
                title="Charge rules are simple, but they matter for integrations."
                body="Page 1 deducts one credit from the key owner. Later pages must still have a positive balance, but they must not double-charge the same result flow. Keep submission guards and retry behavior tight when you integrate this into a UI."
              />

              <div className="card-border-gradient rounded-[20px] p-6 md:p-7">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    "Page 1 searches deduct one credit from the key owner.",
                    "Page 2+ requests still require a positive balance.",
                    "Later pages do not charge again for the same search flow.",
                    "Use GET /api/v1/credits to check the live searchable balance.",
                  ].map((item) => (
                    <div key={item} className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 font-sans text-[12px] leading-6 text-white/68">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <SectionTitle
                id="endpoints"
                eyebrow="Endpoints"
                title="Two stable public endpoints cover search and balance checks."
                body="The docs below reflect the current backend contract exactly, including q/query normalization, page and limit constraints, and server-side redaction behavior."
              />

              <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
                {ENDPOINT_REFERENCES.map((endpointRef) => (
                  <div key={endpointRef.id} className="card-border-gradient rounded-[20px] p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[12px] text-[#05df72]">{endpointRef.method} {endpointRef.path}</p>
                        <h3 className="mt-2 font-sans text-[17px] font-semibold text-white">{endpointRef.title}</h3>
                        <p className="mt-2 font-sans text-[13px] leading-6 text-white/55">{endpointRef.description}</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Auth</p>
                        <p className="mt-2 font-sans text-[13px] text-white/78">{endpointRef.auth}</p>
                      </div>
                      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Content Type</p>
                        <p className="mt-2 font-sans text-[13px] text-white/78">{endpointRef.contentType}</p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-2">
                      {endpointRef.notes.map((note) => (
                        <div key={note} className="rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 font-sans text-[12px] leading-6 text-white/65">
                          {note}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <DocsTable
                headers={["Field", "Type", "Required", "Description"]}
                rows={SEARCH_REQUEST_FIELDS.map((field) => [
                  field.name,
                  field.type,
                  field.required ? "Yes" : "No",
                  field.description,
                ])}
              />

              <SectionTitle
                id="filters"
                eyebrow="Filters"
                title="Type-specific aliases are normalized before validation completes."
                body="These tables show the public filter names you can send. Aliases like display_name and user_id are preserved for compatibility, then normalized into the internal schema."
              />

              <div className="space-y-5">
                {(["profile", "channel", "group", "message"] as PublicApiSearchType[]).map((type) => (
                  <div key={type} className="card-border-gradient rounded-[20px] p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Search Type</p>
                        <h3 className="mt-1 font-sans text-[17px] font-semibold text-white capitalize">{type}</h3>
                      </div>
                      <button
                        onClick={() => {
                          setEndpoint("search");
                          handleSearchTypeChange(type);
                          document.getElementById("try-it")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="inline-flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Load in explorer
                      </button>
                    </div>
                    <DocsTable
                      headers={["Normalized Field", "Accepted Aliases", "Type", "Meaning"]}
                      rows={FILTER_REFERENCE[type].map((row) => [row.field, row.aliases, row.type, row.description])}
                    />
                  </div>
                ))}
              </div>

              <SectionTitle
                id="responses"
                eyebrow="Responses"
                title="Search responses include both result data and integration metadata."
                body="Unified search returns the response envelope used by the app search layer, plus creditsRemaining and a small apiKey object. Credits lookup returns the balance for the authenticated key owner."
              />

              <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
                <CodeCard title="Sample search success" label="JSON" code={formatJson(SUCCESS_RESPONSE_EXAMPLES.search)} />
                <CodeCard title="Sample credits success" label="JSON" code={formatJson(SUCCESS_RESPONSE_EXAMPLES.credits)} />
              </div>

              <div className="card-border-gradient rounded-[20px] p-6">
                <h3 className="font-sans text-[17px] font-semibold text-white">Result handling notes</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    "`results`, `total`, `page`, and `limit` are always returned for search.",
                    "`creditsRemaining` is returned after the credit check runs.",
                    "`apiKey.id` and `apiKey.name` let callers inspect which key was used.",
                    "Message results may include `matchedTerms` and `contextLink` for downstream navigation.",
                  ].map((note) => (
                    <div key={note} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 font-sans text-[12px] leading-6 text-white/65">
                      {note}
                    </div>
                  ))}
                </div>
              </div>

              <SectionTitle
                id="errors"
                eyebrow="Errors"
                title="Error codes are stable enough to branch on in client code."
                body="Use the returned code for product behavior and logging. Validation failures may also include an issues array from Zod. Search and non-search failures intentionally use different 500-class codes."
              />

              <div className="card-border-gradient overflow-hidden rounded-[20px]">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-5">
                  <ShieldAlert className="h-5 w-5 text-[#ff8a8a]" />
                  <h2 className="font-sans text-[17px] font-semibold text-white">Error Reference</h2>
                </div>
                <DocsTable
                  headers={["Status", "Code", "Meaning", "Typical Trigger"]}
                  rows={ERROR_REFERENCE.map((error) => [
                    error.status,
                    error.code,
                    error.description,
                    error.trigger,
                  ])}
                />
              </div>

              <CodeCard title="Sample validation failure" label="JSON" code={formatJson(SUCCESS_RESPONSE_EXAMPLES.error)} />

              <SectionTitle
                id="examples"
                eyebrow="Examples"
                title="Ready-to-copy snippets use the current site origin automatically."
                body="These snippets mirror the production route shape on this domain and keep key naming generic so you can adapt them quickly."
              />

              <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
                {snippets.map((snippet) => (
                  <CodeCard key={snippet.id} title={snippet.title} label={snippet.label} code={snippet.code} />
                ))}
              </div>

              <SectionTitle
                id="try-it"
                eyebrow="Try It"
                title="Run a live request from the docs with a pasted API key."
                body="The explorer uses same-origin fetch and stores your pasted key only in local page state. It does not persist the key, and it does not add any backend routes beyond the two stable public endpoints."
              />

              <div className="card-border-gradient rounded-[24px] p-6 md:p-7">
                <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                  <div className="min-w-0 space-y-5">
                    <div>
                      <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Endpoint</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {([
                          { value: "search", label: "POST /api/v1/search" },
                          { value: "credits", label: "GET /api/v1/credits" },
                        ] as const).map((item) => (
                          <button
                            key={item.value}
                            onClick={() => setEndpoint(item.value)}
                            className={`rounded-[10px] px-3 py-2 font-sans text-[12px] transition-colors ${
                              endpoint === item.value
                                ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
                                : "border border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Auth Header</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {([
                          { value: "x-api-key", label: "X-API-Key" },
                          { value: "bearer", label: "Bearer token" },
                        ] as const).map((item) => (
                          <button
                            key={item.value}
                            onClick={() => setAuthMode(item.value)}
                            className={`rounded-[10px] px-3 py-2 font-sans text-[12px] transition-colors ${
                              authMode === item.value
                                ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
                                : "border border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {endpoint === "search" && (
                      <div>
                        <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35">Search Type</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(["profile", "channel", "group", "message"] as PublicApiSearchType[]).map((type) => (
                            <button
                              key={type}
                              onClick={() => handleSearchTypeChange(type)}
                              className={`rounded-[10px] px-3 py-2 font-sans text-[12px] capitalize transition-colors ${
                                searchType === type
                                  ? "bg-[#3A2AEE] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
                                  : "border border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35" htmlFor="api-key-input">
                        Your API key
                      </label>
                      <input
                        id="api-key-input"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="your_api_key"
                        className="mt-3 h-[46px] w-full rounded-[12px] border border-white/10 bg-[#232327] px-4 font-mono text-[12px] text-white/85 outline-none placeholder:text-white/25"
                      />
                      <p className="mt-2 font-sans text-[12px] leading-6 text-white/45">
                        Stored only in local page state for this session. Use a non-production key when you are testing from a shared machine.
                      </p>
                    </div>

                    {endpoint === "search" && (
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <label className="font-sans text-[10px] uppercase tracking-[0.1em] text-white/35" htmlFor="request-body">
                            Search request JSON
                          </label>
                          <button
                            onClick={() => setRequestBodyText(formatJson(createDefaultSearchRequest(searchType)))}
                            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
                          >
                            Reset example
                          </button>
                        </div>
                        <textarea
                          id="request-body"
                          value={requestBodyText}
                          onChange={(event) => setRequestBodyText(event.target.value)}
                          className="mt-3 min-h-[220px] w-full rounded-[16px] border border-white/10 bg-[#0d0d12] p-4 font-mono text-[12px] leading-6 text-white/80 outline-none"
                        />
                      </div>
                    )}

                    {requestError && (
                      <div className="rounded-[12px] border border-red-500/20 bg-red-500/[0.06] px-4 py-3 font-sans text-[12px] leading-6 text-red-200">
                        {requestError}
                      </div>
                    )}

                    <button
                      onClick={handleSendRequest}
                      disabled={isRunning}
                      className="inline-flex items-center gap-2 rounded-[10px] bg-[#3A2AEE] px-4 py-2.5 font-sans text-[12px] text-white shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] transition-colors hover:bg-[#4a3aff] disabled:opacity-60"
                    >
                      <Play className="h-4 w-4" />
                      {isRunning ? "Sending request" : "Send request"}
                    </button>
                  </div>

                  <div className="min-w-0 space-y-5">
                    <CodeCard title="Generated curl" label="curl" code={generatedCurl} />
                    <CodeCard title="Generated fetch" label="JavaScript" code={generatedFetch} />

                    <div className="overflow-hidden rounded-[20px] border border-white/[0.06] bg-[#0d0d12]">
                      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                        <div>
                          <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-[#3A2AEE]">Live Response</p>
                          <h3 className="mt-1 font-sans text-[15px] font-semibold text-white">Formatted JSON output</h3>
                        </div>
                        {responseState && (
                          <div className={`rounded-full px-3 py-1 font-mono text-[11px] ${
                            responseState.ok ? "bg-[#05df72]/10 text-[#05df72]" : "bg-red-500/10 text-red-300"
                          }`}>
                            {responseState.status === 0 ? "NETWORK" : `HTTP ${responseState.status}`}
                          </div>
                        )}
                      </div>
                      <div className="px-5 py-4">
                        {responseState?.retryAfter && (
                          <div className="mb-4 rounded-[12px] border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 font-sans text-[12px] leading-6 text-amber-100">
                            Retry-After: {responseState.retryAfter}
                          </div>
                        )}
                        <pre className="m-0 max-h-[420px] w-full max-w-full overflow-auto text-[12px] leading-6 text-white/72">
                          <code>{formatJson(responseState?.body ?? { message: "Send a request to inspect the live response." })}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-24 card-border-gradient rounded-[20px] p-5">
                <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-white/35">On This Page</p>
                <div className="mt-4 flex flex-col gap-2">
                  {DOC_SECTIONS.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="rounded-[10px] px-3 py-2 font-sans text-[12px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white"
                    >
                      {section.label}
                    </a>
                  ))}
                </div>
                <div className="mt-5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-white/35">AI Integrations</p>
                  <p className="mt-2 font-sans text-[12px] leading-6 text-white/55">
                    Need a copy-ready brief for another agent? Use the dedicated AGENTS.md page.
                  </p>
                  <Link
                    to="/api-agents"
                    className="mt-4 inline-flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <BookOpen className="h-4 w-4" />
                    Open AGENTS.md guide
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

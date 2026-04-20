import { useState, useRef, useEffect } from "react";
import gsap from "gsap";

interface FilterModalProps {
  searchType: string;
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  onClose: () => void;
}

const filterConfigs: Record<string, { label: string; placeholder: string; key: string; hint?: string }[]> = {
  username: [
    { label: "Username", placeholder: "Exact or partial", key: "username", hint: "e.g. johndoe or john" },
    { label: "Display Name", placeholder: "Exact or partial", key: "displayName", hint: "e.g. John Doe" },
    { label: "Phone", placeholder: "+1 555 000 0000", key: "phone" },
    { label: "Bio Keyword", placeholder: "Any keyword in bio", key: "bio" },
    { label: "User ID", placeholder: "Numeric user ID", key: "userId" },
  ],
  sound: [
    { label: "Channel Name", placeholder: "Exact or partial", key: "channelName", hint: "e.g. tech talk" },
    { label: "Channel ID", placeholder: "Numeric channel ID", key: "channelId" },
    { label: "Description", placeholder: "Any keyword", key: "description" },
  ],
  people: [
    { label: "Group Name", placeholder: "Exact or partial", key: "groupName", hint: "e.g. crypto traders" },
    { label: "Group ID", placeholder: "Numeric group ID", key: "groupId" },
    { label: "Description", placeholder: "Any keyword", key: "groupDesc" },
  ],
  send: [
    { label: "Sender Username", placeholder: "Exact or partial", key: "senderUsername" },
    { label: "Sender User ID", placeholder: "Numeric user ID", key: "senderUserId" },
    { label: "Chat ID", placeholder: "Numeric chat ID", key: "chatId" },
    { label: "Date From", placeholder: "YYYY-MM-DD", key: "dateStart" },
    { label: "Date To", placeholder: "YYYY-MM-DD", key: "dateEnd" },
    { label: "Has Media", placeholder: "true / false", key: "hasMedia" },
    { label: "Has Links", placeholder: "true / false", key: "hasLinks" },
    { label: "Min Length", placeholder: "Minimum message length", key: "minLength" },
  ],
};

const searchTypeLabels: Record<string, string> = {
  username: "Username Search",
  sound: "Channel Search",
  people: "Groups Search",
  send: "Messages Search",
};

function FilterField({
  config,
  value,
  onChange,
}: {
  config: (typeof filterConfigs)[string][number];
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    gsap.fromTo(el, { filter: "blur(4px)", opacity: 0, x: -6 }, { filter: "blur(0px)", opacity: 1, x: 0, duration: 0.3, ease: "power2.out" });
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-white/50 font-sans font-medium tracking-wide uppercase" style={{ letterSpacing: "0.05em" }}>
        {config.label}
      </label>
      <div
        ref={wrapRef}
        className="bg-[#1A1A1E] border border-white/[0.08] rounded-[6px] h-[36px] flex items-center px-[12px] input-glow"
        style={{ filter: "blur(4px)", opacity: 0 }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(config.key, e.target.value)}
          placeholder={config.placeholder}
          className="bg-transparent w-full h-full outline-none font-sans font-normal text-[12px] text-white/70 placeholder:text-white/25"
        />
      </div>
      {config.hint && <span className="text-[10px] text-white/25 font-sans">{config.hint}</span>}
    </div>
  );
}

export default function FilterModal({ searchType, filters, onFiltersChange, onClose }: FilterModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({ ...filters });
  const scrollYRef = useRef<number>(0);

  const configs = filterConfigs[searchType] || [];

  useEffect(() => {
    scrollYRef.current = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollYRef.current);
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    gsap.set(overlay, { opacity: 0 });
    gsap.set(panel, { filter: "blur(8px)", opacity: 0, scale: 0.96, y: -8 });

    gsap.to(overlay, { opacity: 1, duration: 0.2, ease: "none" });
    gsap.to(panel, { filter: "blur(0px)", opacity: 1, scale: 1, y: 0, duration: 0.25, ease: "power3.out" });
  }, []);

  const handleClose = (apply = false) => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    gsap.to(panel, { filter: "blur(8px)", opacity: 0, scale: 0.96, y: -8, duration: 0.2, ease: "power3.in" });
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.22,
      ease: "none",
      delay: 0.05,
      onComplete: () => {
        if (apply) {
          onFiltersChange(localFilters);
        }
        onClose();
      },
    });
  };

  const handleChange = (key: string, val: string) => {
    setLocalFilters((prev) => ({ ...prev, [key]: val }));
  };

  const activeCount = Object.values(localFilters).filter((v) => v.trim() !== "").length;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[400px] mx-4 rounded-[14px] overflow-hidden"
        style={{
          background: "#0F0F11",
          border: "1px solid rgba(255,255,255,0.08)",
          filter: "blur(8px)",
          opacity: 0,
        }}
      >
        <div
          className="px-5 pt-4 pb-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-white/90 font-sans font-semibold">{searchTypeLabels[searchType] || "Filters"}</span>
              {activeCount > 0 && (
                <span
                  className="inline-flex items-center justify-center text-[9px] font-semibold text-white rounded-full"
                  style={{
                    background: "rgba(58,42,238,0.7)",
                    width: "16px",
                    height: "16px",
                    fontSize: "9px",
                  }}
                >
                  {activeCount}
                </span>
              )}
            </div>
            <button
              onClick={() => handleClose()}
              className="w-6 h-6 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-all cursor-pointer bg-transparent border-0 p-0"
              aria-label="Close filters"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-white/30 font-sans mt-1">Refine your search with additional filters</p>
        </div>

        <div className="px-5 pt-3 pb-3 flex flex-col gap-2.5">
          {configs.map((config) => (
            <FilterField
              key={config.key}
              config={config}
              value={localFilters[config.key] || ""}
              onChange={handleChange}
            />
          ))}
        </div>

        <div
          className="px-5 pt-3 pb-5 flex items-center gap-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => {
              setLocalFilters({});
              onFiltersChange({});
            }}
            className="flex-1 h-[36px] rounded-[6px] bg-transparent border border-white/10 text-white/60 font-sans font-medium text-[12px] hover:bg-white/5 hover:text-white/80 transition-all cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={() => handleClose(true)}
            className="flex-[2] h-[36px] rounded-[6px] bg-brand text-white font-sans font-semibold text-[12px] hover:bg-brand-light transition-all cursor-pointer shadow-[inset_0px_1px_0.5px_0px_rgba(255,255,255,0.25)]"
            style={{ boxShadow: "inset 0px 1px 0.5px 0px rgba(255,255,255,0.25)" }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

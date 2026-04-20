import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import FilterModal from "./FilterModal";
import { InsufficientCreditsModal } from "./InsufficientCreditsModal";
import { LoginPromptModal } from "./LoginPromptModal";
import { useSearchGating } from "@/lib/hooks/useSearchGating";
import { isAuthenticated } from "@/lib/auth";

type SearchType = "username" | "sound" | "people" | "send";

const searchTypes: { type: SearchType; label: string; icon: React.ReactNode }[] = [
  {
    type: "username",
    label: "Username",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M7.99992 1.33398C4.32658 1.33398 1.33325 4.32732 1.33325 8.00065C1.33325 11.674 4.32658 14.6673 7.99992 14.6673C8.97992 14.6673 9.97325 14.4207 10.9599 13.934L10.3666 12.7407C9.56658 13.134 8.76658 13.3407 7.99325 13.3407C5.05325 13.3407 2.65992 10.9473 2.65992 8.00732C2.65992 5.06732 5.05992 2.66732 7.99992 2.66732C10.9399 2.66732 13.3333 5.06065 13.3333 8.00065V8.66732C13.3333 9.12732 13.1266 10.0007 12.3333 10.0007C11.3999 10.0007 11.3399 8.78732 11.3333 8.66732V5.33398H9.99992V5.35398C9.43992 4.93398 8.75325 4.66732 7.99992 4.66732C6.15992 4.66732 4.66659 6.16065 4.66659 8.00065C4.66659 9.84065 6.15992 11.334 7.99992 11.334C8.96658 11.334 9.83325 10.914 10.4399 10.254C10.7866 10.8473 11.3799 11.334 12.3333 11.334C13.8466 11.334 14.6666 9.96065 14.6666 8.66732V8.00065C14.6666 4.32732 11.6733 1.33398 7.99992 1.33398ZM7.99992 10.0007C6.89992 10.0007 5.99992 9.10065 5.99992 8.00065C5.99992 6.90065 6.89992 6.00065 7.99992 6.00065C9.09992 6.00065 9.99992 6.90065 9.99992 8.00065C9.99992 9.10065 9.09992 10.0007 7.99992 10.0007Z"
          fill="white"
        />
      </svg>
    ),
  },
  {
    type: "sound",
    label: "Channel",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M11.9999 4.66671V2.00005C11.9999 1.76671 11.8733 1.54671 11.6733 1.42671C11.5733 1.36841 11.4599 1.33714 11.3441 1.33597C11.2284 1.3348 11.1144 1.36378 11.0133 1.42005L5.15992 4.66671H2.66659C1.93325 4.66671 1.33325 5.26671 1.33325 6.00005V9.33338C1.33325 10.0667 1.93325 10.6667 2.66659 10.6667H4.66659V14.6667H5.99992V11.0267L11.0599 13.2734C11.1466 13.3134 11.2399 13.3334 11.3333 13.3334C11.5095 13.3316 11.6781 13.2608 11.8027 13.1362C11.9274 13.0115 11.9982 12.843 11.9999 12.6667V10C13.4733 10 14.6666 8.80671 14.6666 7.33338C14.6666 5.86005 13.4733 4.66671 11.9999 4.66671ZM2.66659 9.33338V6.00005H4.66659V9.33338H2.66659ZM10.6666 11.64L5.99992 9.56671V5.72671L10.6666 3.13338V11.64ZM11.9999 8.66671V6.00005C12.7333 6.00005 13.3333 6.60005 13.3333 7.33338C13.3333 8.06671 12.7333 8.66671 11.9999 8.66671Z"
          fill="white"
        />
      </svg>
    ),
  },
  {
    type: "people",
    label: "Groups",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M7.99992 7.33398C9.13992 7.33398 9.99992 6.47398 9.99992 5.33398C9.99992 4.19398 9.13992 3.33398 7.99992 3.33398C6.85992 3.33398 5.99992 4.19398 5.99992 5.33398C5.99992 6.47398 6.85992 7.33398 7.99992 7.33398ZM7.99992 4.66732C8.39992 4.66732 8.66658 4.93398 8.66658 5.33398C8.66658 5.73398 8.39992 6.00065 7.99992 6.00065C7.59992 6.00065 7.33325 5.73398 7.33325 5.33398C7.33325 4.93398 7.59992 4.66732 7.99992 4.66732ZM8.66658 8.00065H7.33325C5.49325 8.00065 3.99992 9.49398 3.99992 11.334V11.6673C3.99992 12.2207 4.44659 12.6673 4.99992 12.6673H10.9999C11.5533 12.6673 11.9999 12.2207 11.9999 11.6673V11.334C11.9999 9.49398 10.5066 8.00065 8.66658 8.00065ZM5.33325 11.334C5.33325 10.234 6.23325 9.33398 7.33325 9.33398H8.66658C9.76658 9.33398 10.6666 10.234 10.6666 11.334H5.33325ZM4.33325 7.33398C4.64659 7.33398 4.93325 7.25398 5.17992 7.11398C4.90032 6.66881 4.7293 6.16414 4.68066 5.6407C4.63202 5.11726 4.70713 4.58972 4.89992 4.10065C4.72659 4.04065 4.53325 4.00065 4.33325 4.00065C3.37325 4.00065 2.66659 4.70732 2.66659 5.66732C2.66659 6.62732 3.37325 7.33398 4.33325 7.33398ZM4.07325 8.00065H3.66659C2.37992 8.00065 1.33325 9.04732 1.33325 10.334V11.0007C1.33325 11.1873 1.47992 11.334 1.66659 11.334H2.66659C2.66659 10.0273 3.20659 8.84732 4.07325 8.00065ZM11.6666 7.33398C12.6266 7.33398 13.3333 6.62732 13.3333 5.66732C13.3333 4.70732 12.6266 4.00065 11.6666 4.00065C11.4599 4.00065 11.2733 4.04065 11.0999 4.10065C11.2927 4.58972 11.3678 5.11726 11.3192 5.6407C11.2705 6.16414 11.0995 6.66881 10.8199 7.11398C11.0666 7.25398 11.3466 7.33398 11.6666 7.33398ZM12.3333 8.00065H11.9266C12.372 8.43397 12.726 8.95224 12.9677 9.52479C13.2093 10.0973 13.3336 10.7125 13.3333 11.334H14.3333C14.5199 11.334 14.6666 11.1873 14.6666 11.0007V10.334C14.6666 9.04732 13.6199 8.00065 12.3333 8.00065Z"
          fill="white"
        />
      </svg>
    ),
  },
  {
    type: "send",
    label: "Messages",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M14.2734 7.39347L2.27341 2.06013C2.15327 2.00739 2.02023 1.99128 1.89097 2.01381C1.7617 2.03634 1.64196 2.09652 1.54675 2.1868C1.35341 2.37347 1.28675 2.65347 1.38008 2.9068L3.29341 8.0068L1.38008 13.1068C1.28675 13.3601 1.35341 13.6401 1.54675 13.8268C1.64327 13.9173 1.76455 13.9771 1.89514 13.9984C2.02574 14.0198 2.15974 14.0018 2.28008 13.9468L14.2801 8.61347C14.3969 8.56085 14.4961 8.47561 14.5657 8.36799C14.6352 8.26037 14.6722 8.13495 14.6722 8.0068C14.6722 7.87865 14.6352 7.75323 14.5657 7.64561C14.4961 7.53799 14.3969 7.45275 14.2801 7.40013L14.2734 7.39347ZM3.18675 12.0801L4.00675 9.90013V10.0001L8.00675 8.00013L4.00675 6.00013V6.10013L3.18675 3.92013L12.3601 8.00013L3.18675 12.0801Z"
          fill="white"
        />
      </svg>
    ),
  },
];

export default function SearchBar({ onSearch }: { onSearch?: (query: string, type: SearchType, page?: number, filters?: Record<string, string>) => void }) {
  const [activeType, setActiveType] = useState<SearchType>("username");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const { gatingState, checkSearch } = useSearchGating();

  const activeFilterCount = Object.values(filters).filter((v) => v.trim() !== "").length;

  const handleFiltersChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters);
  };

  const handleTypeChange = (type: SearchType) => {
    setActiveType(type);
    setFilters({});
  };

  const handleSearch = (page?: number) => {
    const check = checkSearch();

    if (!isAuthenticated()) {
      setShowLoginModal(true);
      return;
    }

    if (check.reason === "no_credits") {
      setShowCreditsModal(true);
      return;
    }

    if ((query.trim() || Object.values(filters).some(v => v.trim())) && onSearch) {
      onSearch(query, activeType, page, filters);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const renderGatingUI = () => {
    switch (gatingState.status) {
      case "loading":
        return null;
      case "unauthenticated":
        return (
          <p className="text-white/60 text-xs text-center mt-2">
            <button
              onClick={() => setShowLoginModal(true)}
              className="underline hover:text-[#3A2AEE] transition-colors"
            >
              Sign in
            </button>{" "}
            to search
          </p>
        );
      case "no_credits":
        return (
          <p className="text-yellow-500/80 text-xs text-center mt-2">
            {gatingState.balance} credit{gatingState.balance !== 1 ? "s" : ""} remaining -{" "}
            <button
              onClick={() => setShowCreditsModal(true)}
              className="underline hover:no-underline"
            >
              Get more credits
            </button>
          </p>
        );
      case "ready":
        return (
          <p className="text-white/60 text-xs text-center mt-2">
            {gatingState.balance} credit{gatingState.balance !== 1 ? "s" : ""} available
          </p>
        );
    }
  };

  const getPlaceholder = () => {
    switch (activeType) {
      case "username":
        return "Enter the username you'd like to search";
      case "sound":
        return "Enter the channel you'd like to search";
      case "people":
        return "Enter the group you'd like to search";
      case "send":
        return "Enter the message you'd like to search";
      default:
        return "Enter your search query";
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-3 w-full min-w-[410px] sm:min-w-[600px] xl:min-w-[800px] px-4">
        <div className="flex items-center rounded-lg border border-white/20 bg-brand/10 shadow-[0_2px_0.5px_0_rgba(255,255,255,0.10)_inset] overflow-hidden">
          {searchTypes.map((st, idx) => (
            <button
              key={st.type}
              onClick={() => handleTypeChange(st.type)}
              className="relative flex items-center justify-center text-white overflow-hidden"
              style={{
                transition: "width 350ms cubic-bezier(0.32, 0.72, 0, 1), background 200ms ease",
                width: activeType === st.type ? `${st.label.length * 7.2 + 44}px` : "44px",
                height: "38px",
                background: activeType === st.type ? "rgba(58, 42, 238, 0.1)" : "transparent",
              }}
            >
              <span
                className="absolute flex items-center gap-2 text-xs font-normal"
                style={{
                  transition: "opacity 250ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
                  opacity: activeType === st.type ? 1 : 0,
                  transform: activeType === st.type ? "translateY(0)" : "translateY(4px)",
                  whiteSpace: "nowrap",
                }}
              >
                {st.icon}
                {st.label}
              </span>
              <span
                style={{
                  transition: "opacity 250ms cubic-bezier(0.32, 0.72, 0, 1)",
                  opacity: activeType === st.type ? 0 : 1,
                }}
              >
                {st.icon}
              </span>
              {idx < searchTypes.length - 1 && (
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-px bg-white/20 pointer-events-none"
                  style={{ zIndex: 1 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-stretch w-full gap-2">
          <div className="flex-1 flex items-center rounded-lg border border-white/20 bg-brand/10 shadow-[0_2px_0.5px_0_rgba(255,255,255,0.10)_inset] px-4 py-3 gap-3">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="flex-shrink-0 opacity-40">
              <path
                d="M11.5404 5.77022C11.5404 2.58939 8.95106 0 5.77022 0C2.58939 0 0 2.58939 0 5.77022C0 8.95106 2.58939 11.5404 5.77022 11.5404C7.10459 11.5404 8.32354 11.086 9.30448 10.3215L12.983 14L14 12.983L10.3215 9.30448C11.1088 8.29432 11.5376 7.05094 11.5404 5.77022ZM1.44256 5.77022C1.44256 3.38279 3.38279 1.44256 5.77022 1.44256C8.15765 1.44256 10.0979 3.38279 10.0979 5.77022C10.0979 8.15765 8.15765 10.0979 5.77022 10.0979C3.38279 10.0979 1.44256 8.15765 1.44256 5.77022Z"
                fill="white"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getPlaceholder()}
              className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
            />
            <button
              ref={filterBtnRef}
              onClick={() => setFiltersOpen(true)}
              className="flex-shrink-0 bg-transparent border-0 p-0 cursor-pointer relative group"
              aria-label="Open filters"
            >
              <svg
                width="13"
                height="14"
                viewBox="0 0 13 14"
                fill="none"
                className="opacity-60 group-hover:opacity-100 transition-opacity"
              >
                <path
                  d="M12.2778 0H0.722222C0.325 0 0 0.315 0 0.7V2.1C0 2.254 0.0505556 2.401 0.144444 2.52L4.33333 7.931V13.3C4.33333 13.4857 4.40942 13.6637 4.54487 13.795C4.68031 13.9263 4.86401 14 5.05556 14C5.16389 14 5.27944 13.972 5.38056 13.923L8.26944 12.523C8.38855 12.4648 8.48871 12.3758 8.55882 12.2659C8.62893 12.1559 8.66626 12.0293 8.66667 11.9V7.931L12.8556 2.52C12.9494 2.401 13 2.254 13 2.1V0.7C13 0.315 12.675 0 12.2778 0ZM11.5556 1.869L7.36667 7.28C7.27278 7.399 7.22222 7.546 7.22222 7.7V11.466L5.77778 12.166V7.7C5.77778 7.546 5.72722 7.399 5.63333 7.28L1.44444 1.869V1.4H11.5556V1.869Z"
                  fill="white"
                />
              </svg>
              {activeFilterCount > 0 && (
                <span
                  className="absolute -top-2 -right-2 inline-flex items-center justify-center rounded-full text-white font-semibold"
                  style={{
                    background: "#3A2AEE",
                    width: "14px",
                    height: "14px",
                    fontSize: "7px",
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => handleSearch()}
            className="flex items-center justify-center w-12 h-12 rounded-lg bg-brand border-r border-b border-l border-white/20 shadow-[0_2px_0.5px_0_rgba(255,255,255,0.30)_inset] flex-shrink-0 hover:bg-brand-light transition-colors"
            aria-label="Search"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M11.5404 5.77022C11.5404 2.58939 8.95106 0 5.77022 0C2.58939 0 0 2.58939 0 5.77022C0 8.95106 2.58939 11.5404 5.77022 11.5404C7.10459 11.5404 8.32354 11.086 9.30448 10.3215L12.983 14L14 12.983L10.3215 9.30448C11.1088 8.29432 11.5376 7.05094 11.5404 5.77022ZM1.44256 5.77022C1.44256 3.38279 3.38279 1.44256 5.77022 1.44256C8.15765 1.44256 10.0979 3.38279 10.0979 5.77022C10.0979 8.15765 8.15765 10.0979 5.77022 10.0979C3.38279 10.0979 1.44256 8.15765 1.44256 5.77022Z"
                fill="white"
              />
            </svg>
          </button>
        </div>

        {renderGatingUI()}

        <p className="text-white/60 text-xs text-center">
          By selecting search you agree to our{" "}
          <a href="#" className="text-brand underline hover:text-brand-light transition-colors">
            Terms of use
          </a>
        </p>

        {filtersOpen && createPortal(
          <FilterModal
            searchType={activeType}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClose={() => setFiltersOpen(false)}
          />,
          document.body
        )}
      </div>

      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        currentBalance={gatingState.status === "no_credits" ? gatingState.balance : 0}
      />

      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </>
  );
}

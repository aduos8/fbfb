import { useRef, useEffect, useState, useCallback } from "react";
import gsap from "gsap";
import { useNavigate } from "react-router-dom";
import type { ChannelResult, GroupResult, LookupMessage, MessageResult, ProfileResult } from "@shared/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpcClient } from "@/App";
import { useToast } from "@/components/ui/use-toast";

type SearchType = "profile" | "channel" | "group" | "message";
type SearchResult = ProfileResult | ChannelResult | GroupResult | MessageResult;

type SearchState = {
  data: SearchResult[];
  type: string;
} | null;

type ResultNavigationState = {
  prefetchedMessage?: LookupMessage;
};

const searchTypeLabelMap: Record<SearchType, string> = {
  profile: "Profile",
  channel: "Channel",
  group: "Group",
  message: "Message",
};

function trimValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeHighlightedSnippet(rawHtml: string) {
  const escaped = rawHtml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

function buildUnifiedSearchInput(query: string, type: SearchType, filters: Record<string, string>, page: number, limit: number) {
  const normalizedQuery = trimValue(query);

  switch (type) {
    case "profile":
      return {
        type: "profile" as const,
        query: normalizedQuery,
        filters: {
          username: trimValue(filters.username),
          display_name: trimValue(filters.display_name),
          number: trimValue(filters.number),
          bio: trimValue(filters.bio),
          user_id: trimValue(filters.user_id),
        },
        page,
        limit,
      };
    case "channel":
      return {
        type: "channel" as const,
        query: normalizedQuery,
        filters: {
          username: trimValue(filters.username),
          display_name: trimValue(filters.display_name),
          bio: trimValue(filters.bio),
          chat_id: trimValue(filters.chat_id),
        },
        page,
        limit,
      };
    case "group":
      return {
        type: "group" as const,
        query: normalizedQuery,
        filters: {
          username: trimValue(filters.username),
          display_name: trimValue(filters.display_name),
          bio: trimValue(filters.bio),
          chat_id: trimValue(filters.chat_id),
        },
        page,
        limit,
      };
    case "message":
      return {
        type: "message" as const,
        query: normalizedQuery,
        filters: {
          keyword: normalizedQuery,
          username: trimValue(filters.username),
          user_id: trimValue(filters.user_id),
          chat_id: trimValue(filters.chat_id),
          dateStart: trimValue(filters.dateStart),
          dateEnd: trimValue(filters.dateEnd),
          hasMedia: parseBoolean(filters.hasMedia),
          containsLinks: parseBoolean(filters.containsLinks),
          minLength: parseNumber(filters.minLength),
        },
        page,
        limit,
      };
  }
}

function HighlightedMarkup({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: sanitizeHighlightedSnippet(html) }} />;
}

function buildPrefetchedLookupMessage(result: MessageResult): LookupMessage {
  return {
    messageId: result.messageId,
    chatId: result.chatId,
    timestamp: result.timestamp,
    content: result.snippet,
    highlightedSnippet: result.highlightedSnippet,
    hasMedia: result.hasMedia,
    containsLinks: result.containsLinks,
    sender: result.sender,
    chat: result.chat,
    contextLink: result.contextLink,
    redaction: result.redaction,
  };
}

function ResultCard({
  result,
  onNavigate,
}: {
  result: SearchResult;
  onNavigate: (path: string, state?: ResultNavigationState) => void;
}) {
  const borderRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    switch (result.resultType) {
      case "profile":
        onNavigate(`/lookup/profile/${result.telegramUserId}`);
        return;
      case "channel":
        onNavigate(`/lookup/channel/${result.telegramChatId}`);
        return;
      case "group":
        onNavigate(`/lookup/group/${result.telegramChatId}`);
        return;
      case "message":
        onNavigate(result.contextLink, {
          prefetchedMessage: buildPrefetchedLookupMessage(result),
        });
        return;
    }
  };

  const handleMouseDown = () => {
    gsap.to(bgRef.current, {
      backgroundColor: "rgba(17, 16, 24, 0.55)",
      duration: 0.08,
      ease: "power2.out",
    });
    gsap.to(chevronRef.current, {
      x: 2,
      duration: 0.08,
      ease: "power2.out",
    });
  };

  const handleMouseUp = () => {
    gsap.to(bgRef.current, {
      backgroundColor: "rgba(17, 16, 24, 0.3)",
      duration: 0.3,
      ease: "power2.out",
    });
    gsap.to(chevronRef.current, {
      x: 4,
      duration: 0.2,
      ease: "power2.out",
    });
  };

  const handleMouseEnter = () => {
    gsap.to(borderRef.current, {
      borderColor: "rgba(58, 42, 238, 0.5)",
      duration: 0.2,
      ease: "power2.out",
    });
    gsap.to(chevronRef.current, {
      x: 4,
      duration: 0.25,
      ease: "power2.out",
    });
  };

  const handleMouseLeave = () => {
    gsap.to(borderRef.current, {
      borderColor: "rgba(58, 42, 238, 0.3)",
      duration: 0.2,
      ease: "power2.out",
    });
    gsap.to(chevronRef.current, {
      x: 0,
      duration: 0.2,
      ease: "power2.out",
    });
    gsap.to(bgRef.current, {
      backgroundColor: "rgba(17, 16, 24, 0.3)",
      duration: 0.3,
      ease: "power2.out",
    });
  };

  const avatar = (() => {
    switch (result.resultType) {
      case "profile":
        return result.profilePhoto || `https://i.pravatar.cc/150?u=${result.telegramUserId}`;
      case "channel":
      case "group":
        return result.profilePhoto || `https://i.pravatar.cc/150?u=${result.telegramChatId}`;
      case "message":
        return `https://i.pravatar.cc/150?u=${result.chat.chatId}:${result.messageId}`;
    }
  })();

  const title = (() => {
    switch (result.resultType) {
      case "profile":
        return result.displayName || result.username || "Unknown User";
      case "channel":
        return result.channelTitle || result.username || "Unknown Channel";
      case "group":
        return result.groupTitle || result.username || "Unknown Group";
      case "message":
        return <HighlightedMarkup html={result.highlightedSnippet} />;
    }
  })();

  const subtitle = (() => {
    switch (result.resultType) {
      case "profile":
        return result.username ? `@${result.username}` : null;
      case "channel":
        return result.username ? `@${result.username}` : null;
      case "group":
        return result.username ? `@${result.username}` : null;
      case "message":
        return result.sender.username ? `@${result.sender.username}` : null;
    }
  })();

  const profileId = (() => {
    switch (result.resultType) {
      case "profile":
        return result.telegramUserId;
      case "channel":
        return result.telegramChatId;
      case "group":
        return result.telegramChatId;
      case "message":
        return result.chatId;
    }
  })();

  const secondaryMeta = (() => {
    switch (result.resultType) {
      case "profile":
        return result.bio || result.basicMetadata.trackingStatus || null;
      case "channel":
        return result.channelDescription
          || (result.subscriberCount != null ? `${result.subscriberCount.toLocaleString()} subscribers` : "Subscriber count unavailable");
      case "group":
        {
          const memberCount = result.activityMetrics.memberCount ?? result.activityMetrics.participantCount;
        return result.groupDescription
          || `${result.publicIndicator} ${result.groupType || "group"}${memberCount != null ? ` · ${memberCount.toLocaleString()} members` : ""}`;
        }
      case "message":
        return result.chat.title
          ? `in ${result.chat.title}${result.timestamp ? ` · ${new Date(result.timestamp).toLocaleString()}` : ""}`
          : result.timestamp
            ? new Date(result.timestamp).toLocaleString()
            : "Message result";
    }
  })();

  return (
    <div
      className="result-card relative rounded-[10px] overflow-hidden cursor-pointer"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={borderRef}
        className="absolute inset-0 rounded-[10px] border border-[rgba(58,42,238,0.3)]"
      />
      <div
        ref={bgRef}
        className="absolute inset-0 rounded-[10px] bg-[rgba(17,16,24,0.3)]"
      />
      <div className="relative px-5 py-3">
        <div className="flex items-center gap-4">
          <img
            src={avatar}
            alt={typeof title === "string" ? title : result.resultType}
            className="w-[56px] h-[56px] rounded-[8px] object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0 py-1.5">
            <div className="mb-1.5">
              <span className="font-sans font-semibold text-[16px] text-white leading-tight block truncate">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              {subtitle && (
                <span className="font-sans font-normal text-[12px] text-[#3A2AEE] leading-tight">
                  {subtitle}
                </span>
              )}
              <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.25)] leading-tight truncate">
                {profileId}
              </span>
            </div>
            {secondaryMeta && (
              <div className="mb-1.5 min-w-0">
                <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.3)] leading-tight block truncate">
                  {secondaryMeta}
                </span>
              </div>
            )}
            {result.redaction.applied && (
              <span className="font-sans font-normal text-[10px] text-[#ff8080] uppercase">
                redacted
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans font-normal text-[10px] text-[rgba(255,255,255,0.3)] leading-tight uppercase">
                {result.resultType}
              </span>
            </div>
            <div ref={chevronRef}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="text-[rgba(255,255,255,0.3)] flex-shrink-0">
                <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const heroSubRef = useRef<HTMLParagraphElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const resultsWrapRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const navigate = useNavigate();
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<SearchState>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentType, setCurrentType] = useState<SearchType>("profile");
  const [currentFilters, setCurrentFilters] = useState<Record<string, string>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const pageSize = 25;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([heroTitleRef.current, heroSubRef.current, searchWrapRef.current], {
        filter: "blur(12px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(heroTitleRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.75 }, 0.2)
        .to(heroSubRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.4)
        .to(searchWrapRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.7 }, 0.55);
    }, heroRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!showResults || !results || !resultsWrapRef.current) return;

    const ctx = gsap.context(() => {
      const cards = resultsWrapRef.current?.querySelectorAll(".result-card");
      if (cards && cards.length > 0) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 16, scale: 0.98 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            ease: "back.out(1.2)",
            stagger: { each: 0.07, from: "start" },
          }
        );
      }
    }, resultsWrapRef);

    return () => ctx.revert();
  }, [showResults, results?.data?.length]);

  const handleSearch = useCallback(async (query: string, type: SearchType, page = 1, filters: Record<string, string> = {}) => {
    setIsSearching(true);
    if (page === 1) {
      setShowResults(false);
      setCurrentQuery(query);
      setCurrentType(type);
      setCurrentFilters(filters);
    }

    try {
      const payload = buildUnifiedSearchInput(query, type, filters, page, pageSize);
      const searchData = await trpcClient.search.unified.query(payload) as { results: SearchResult[]; total: number };
      const nextResults = searchData.results;

      setTotalResults(searchData.total);
      setResults({ data: nextResults, type: searchTypeLabelMap[type] });
      setCurrentPage(page);
      setShowResults(true);
    } catch (error: any) {
      if (error?.data?.code === "PRECONDITION_FAILED" && error?.data?.cause?.code === "INSUFFICIENT_CREDITS") {
        toast({
          title: "Out of Credits",
          description: "You need credits to perform searches. Please purchase more credits.",
          variant: "destructive",
        });
      } else if (error?.data?.code === "UNAUTHORIZED") {
        toast({
          title: "Sign In Required",
          description: "Please sign in to search.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Search Failed",
          description: error.message || "An error occurred while searching.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSearching(false);
    }
  }, [toast, pageSize]);

  useEffect(() => {
    if (!showResults || currentType !== "message" || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && results && results.data.length < totalResults) {
          setIsLoadingMore(true);
          void handleSearch(currentQuery, currentType, currentPage + 1, currentFilters);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [showResults, currentType, isLoadingMore, results, totalResults, currentQuery, currentPage, currentFilters, handleSearch]);

  useEffect(() => {
    if (!isLoadingMore) return;
    setIsLoadingMore(false);
  }, [results, isLoadingMore]);

  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const handleNavigate = useCallback((path: string, state?: ResultNavigationState) => {
    navigate(path, state ? { state } : undefined);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        ref={heroRef}
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div className="flex-1 flex flex-col items-center justify-end text-center px-4 sm:px-8 pb-0">
          <h1
            ref={heroTitleRef}
            className="font-sans font-bold text-white leading-tight mb-2 text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[75px]"
          >
            Satisfy your{" "}
            <span className="font-handwriting font-normal text-brand">curiosity</span> on
          </h1>
          <h1
            ref={heroSubRef}
            className="font-sans font-bold text-white leading-tight text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[75px]"
          >
            Get all data{" "}
            <span className="font-handwriting font-normal text-brand">instantly</span>
          </h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start text-center px-4 sm:px-8 pt-4">
          <p className="text-white/80 text-lg md:text-xl max-w-2xl leading-relaxed mb-8">
            Search Telegram profiles, channels, groups, and stored messages with server-enforced filters, ranking, analytics, and redactions.
          </p>

          <div ref={searchWrapRef}>
            <SearchBar onSearch={handleSearch} />
          </div>

          {showResults && results && (
            <div ref={resultsWrapRef} className="w-full max-w-[827px] mx-auto mt-10 pb-8 text-left">
              <div ref={resultsContainerRef}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="font-sans font-normal text-[14px] text-white">
                      {totalResults} Result{totalResults !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-[2px] bg-[rgba(17,16,24,0.3)] border border-[rgba(58,42,238,0.3)] backdrop-blur-[16.5px]">
                      <span className="font-sans font-normal text-[8px] text-[#3A2AEE] uppercase">
                        {results.type}
                      </span>
                    </div>
                    {isSearching && (
                      <div className="w-4 h-4 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSearch(currentQuery, currentType, currentPage - 1, currentFilters)}
                      disabled={currentPage === 1 || isSearching}
                      className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    >
                      Prev
                    </button>
                    <span className="font-sans text-[12px] text-white/50">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => handleSearch(currentQuery, currentType, currentPage + 1, currentFilters)}
                      disabled={currentPage >= totalPages || isSearching}
                      className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="h-px w-full bg-[rgba(255,255,255,0.05)] mb-4" />

                {results.data.length === 0 ? (
                  <div className="rounded-[10px] border border-[rgba(58,42,238,0.18)] bg-[rgba(17,16,24,0.35)] px-5 py-8 text-center">
                    <p className="font-sans text-[14px] text-white/70">No results matched this search.</p>
                    <p className="font-sans text-[12px] text-white/35 mt-2">Try a broader query or adjust the advanced filters.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.data.map((result) => (
                      <ResultCard
                        key={`${result.resultType}-${result.resultType === "profile" ? result.telegramUserId : result.resultType === "message" ? `${result.chatId}:${result.messageId}` : result.telegramChatId}`}
                        result={result}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <span className="font-sans text-[11px] text-white/40">
                    Showing {results.data.length} of {totalResults.toLocaleString()} results
                  </span>
                  {currentType === "message" && results.data.length < totalResults && !isLoadingMore && (
                    <span className="font-sans text-[11px] text-[#3A2AEE]">
                      Scroll for more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-[40px]" />
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}

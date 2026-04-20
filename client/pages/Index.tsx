import { useRef, useEffect, useState, useCallback } from "react";
import gsap from "gsap";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { trpcClient } from "@/App";
import { isAuthenticated } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

type SearchType = "username" | "sound" | "people" | "send";

type SearchResult = {
  resultType?: string;
  username?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  bio?: string | null;
  user_id?: string;
  userId?: string;
  chat_id?: string;
  chatId?: string;
  message_id?: string;
  messageId?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  content?: string;
  timestamp?: string | Date | null;
  created_at?: string | Date | null;
  member_count?: number;
  memberCount?: number;
  chat_type?: string;
  type?: string;
  [key: string]: unknown;
};

interface ResultCardProps {
  result: SearchResult;
  resultType: string;
  searchQuery?: string;
  onNavigate?: (path: string) => void;
}

function HighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query || !text) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[rgba(58,42,238,0.4)] text-white px-0.5 rounded-sm">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ResultCard({ result, resultType, searchQuery, onNavigate }: ResultCardProps) {
  const borderRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    const userId = result.userId || result.user_id;
    const chatId = result.chatId || result.chat_id;

    if (resultType === "Profile" && userId) {
      onNavigate?.(`/lookup/profile/${userId}`);
    } else if (resultType === "Channel" && chatId) {
      onNavigate?.(`/lookup/channel/${chatId}`);
    } else if (resultType === "Group" && chatId) {
      onNavigate?.(`/lookup/group/${chatId}`);
    } else if (resultType === "Message" && chatId) {
      onNavigate?.(`/lookup/channel/${chatId}?highlight=${result.messageId || result.message_id}`);
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

  const getAvatar = (): string => {
    if (result.avatarUrl) return String(result.avatarUrl);
    if (result.avatar_url) return String(result.avatar_url);
    if (result.profilePhoto) return String(result.profilePhoto);
    return `https://i.pravatar.cc/150?u=${result.chatId || result.chat_id || result.userId || result.user_id || "default"}`;
  };

  const getTitle = (): React.ReactNode => {
    if ("content" in result) {
      const content = result.content as string;
      const snippet = content.slice(0, 100);
      if (searchQuery && resultType === "Message") {
        return <HighlightedText text={snippet} query={searchQuery} />;
      }
      return snippet + (content.length > 100 ? "..." : "");
    }
    if (result.displayName) return String(result.displayName);
    if (result.display_name) return String(result.display_name);
    if (result.channelTitle) return String(result.channelTitle);
    if (result.groupTitle) return String(result.groupTitle);
    return "Unknown";
  };

  const getSubtitle = () => {
    if (result.username) return `@${result.username}`;
    if ("messageId" in result) return `Message ID: ${result.messageId}`;
    return "";
  };

  const getId = () => {
    if (result.userId) return result.userId;
    if (result.user_id) return result.user_id;
    if (result.chatId) return result.chatId;
    if (result.chat_id) return result.chat_id;
    if ("messageId" in result) return result.messageId;
    if ("message_id" in result) return result.message_id;
    return "";
  };

  const getMeta = (): string => {
    if (result.bio) return String(result.bio);
    if (result.channelDescription) return String(result.channelDescription);
    if (result.groupDescription) return String(result.groupDescription);
    if (result.memberCount) return `${Number(result.memberCount).toLocaleString()} members`;
    if (result.member_count) return `${Number(result.member_count).toLocaleString()} members`;
    if ("type" in result && result.type) return String(result.type);
    if (result.timestamp) return new Date(String(result.timestamp)).toLocaleString();
    if (result.created_at) return new Date(String(result.created_at)).toLocaleString();
    return "";
  };

  const getMessageMeta = (): { sender: string | null; chat: string | null; timestamp: string | null } | null => {
    if (resultType !== "Message") return null;
    const sender = (result.username || result.user_id || result.userId || "") as string;
    const chat = (result.chat_id || result.chatId || "") as string;
    const timestamp = (result.timestamp || result.created_at || "") as string;
    return { sender: sender || null, chat: chat || null, timestamp: timestamp || null };
  };

  const messageMeta = getMessageMeta();

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
            src={getAvatar()}
            alt={String(getTitle())}
            className="w-[56px] h-[56px] rounded-[8px] object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0 py-1.5">
            <div className="mb-1.5">
              <span className="font-sans font-semibold text-[16px] text-white leading-tight block">
                {getTitle()}
              </span>
            </div>
            {messageMeta ? (
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {messageMeta.sender && (
                  <span className="font-sans font-normal text-[12px] text-[#3A2AEE] leading-tight">
                    @{messageMeta.sender}
                  </span>
                )}
                {messageMeta.chat && (
                  <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.3)] leading-tight">
                    in {messageMeta.chat}
                  </span>
                )}
                {messageMeta.timestamp && (
                  <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.3)] leading-tight">
                    {new Date(messageMeta.timestamp as string).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-sans font-normal text-[12px] text-[#3A2AEE] leading-tight">
                  {getSubtitle()}
                </span>
                <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.3)] leading-tight">
                  {getId()}
                </span>
              </div>
            )}
            {!messageMeta && (
              <span className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.3)] leading-tight block truncate">
                {getMeta()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans font-normal text-[10px] text-[rgba(255,255,255,0.3)] leading-tight uppercase">
                {resultType}
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
  const [results, setResults] = useState<{ data: SearchResult[]; type: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentType, setCurrentType] = useState<SearchType>("username");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [currentFilters, setCurrentFilters] = useState<Record<string, string>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const authed = isAuthenticated();
  const { toast } = useToast();
  const pageSize = 25;
  const maxResults = 100000;

  const unifiedSearch = trpc.search.unified.useQuery;

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
    if (!showResults || !results || results.data.length === 0 || !resultsWrapRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.set(resultsWrapRef.current, { autoAlpha: 0, height: 0, overflow: "hidden" })
        .to(resultsWrapRef.current, {
          autoAlpha: 1,
          height: "auto",
          duration: 0.4,
          ease: "power3.out",
          onComplete: () => {
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
          },
        });
    }, resultsWrapRef);

    return () => ctx.revert();
  }, [showResults, results]);

  const handleSearch = useCallback(async (query: string, type: SearchType, page = 1, filters: Record<string, string> = {}) => {
    setIsSearching(true);
    setShowResults(false);

    if (page === 1) {
      setCurrentQuery(query);
      setCurrentType(type);
      setCurrentFilters(filters);
      setHighlightQuery(query || filters.username || filters.displayName || filters.channelName || filters.groupName || filters.senderUsername || filters.senderUserId || "");
    }

    try {
      const typeMap: Record<SearchType, "profile" | "channel" | "group" | "message"> = {
        username: "profile",
        sound: "channel",
        people: "group",
        send: "message",
      };

      const searchType = typeMap[type];
      const searchData = await trpcClient.search.unified.query({
        type: searchType,
        q: query,
        filterChatId: filters.chatId || filters.channelId || filters.groupId,
        filterBucket: filters.bucket,
        filterSenderId: filters.senderUserId,
        filterUsername: filters.username || filters.displayName || filters.channelName || filters.groupName || filters.senderUsername,
        filterDateStart: filters.dateStart,
        filterDateEnd: filters.dateEnd,
        filterHasMedia: filters.hasMedia === "true" ? true : filters.hasMedia === "false" ? false : undefined,
        filterHasLinks: filters.hasLinks === "true" ? true : filters.hasLinks === "false" ? false : undefined,
        filterMinLength: filters.minLength ? parseInt(filters.minLength) : undefined,
        page: page,
        limit: pageSize,
      });

      const searchResultData = searchData as { results: SearchResult[]; total: number } | null;
      const searchResult: { results: SearchResult[]; type: string } = {
        results: (searchResultData?.results || []) as SearchResult[],
        type: type === "username" ? "Profile" : type === "sound" ? "Channel" : type === "people" ? "Group" : "Message",
      };
      setTotalResults(searchResultData?.total || 0);

      if (page === 1) {
        setResults({ data: searchResult.results, type: searchResult.type });
      } else {
        setResults(prev => prev ? { data: [...prev.data, ...searchResult.results], type: searchResult.type } : null);
      }
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
  }, [toast]);

  useEffect(() => {
    if (!showResults || currentType !== "send" || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && results && results.data.length < totalResults) {
          setIsLoadingMore(true);
          handleSearch(currentQuery, currentType, currentPage + 1, currentFilters);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [showResults, currentType, isLoadingMore, results, totalResults, currentQuery, currentType, currentPage, currentFilters, handleSearch]);

  useEffect(() => {
    if (!isLoadingMore) return;
    setIsLoadingMore(false);
  }, [results]);

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
            Get instant results without the grunt work. We automate username verification, breach detection, and log analysis for you.
          </p>

          <div ref={searchWrapRef}>
            <SearchBar onSearch={handleSearch} />
          </div>

          {results && (
            <div ref={resultsWrapRef} className="w-full max-w-[827px] mx-auto mt-10 pb-8 text-left">
              <div ref={resultsContainerRef}>
                {totalResults > 0 && (
                  <>
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
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSearch(currentQuery, currentType, currentPage - 1)}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                        >
                          Prev
                        </button>
                        <span className="font-sans text-[12px] text-white/50">
                          Page {currentPage} of {Math.ceil(totalResults / pageSize)}
                        </span>
                        <button
                          onClick={() => handleSearch(currentQuery, currentType, currentPage + 1)}
                          disabled={currentPage >= Math.ceil(totalResults / pageSize)}
                          className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <div className="h-px w-full bg-[rgba(255,255,255,0.05)] mb-4" />
                  </>
                )}

                <div className="flex flex-col gap-3">
                  {results.data.map((result, i) => (
                    <ResultCard key={i} result={result} resultType={results.type} searchQuery={highlightQuery} onNavigate={navigate} />
                  ))}

                  {currentType === "send" && results.data.length < totalResults && (
                    <>
                      <div ref={sentinelRef} className="h-4" />
                      {isLoadingMore && (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-6 h-6 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {currentType !== "send" && totalResults > pageSize && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      onClick={() => handleSearch(currentQuery, currentType, currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    >
                      Prev
                    </button>
                    <span className="font-sans text-[12px] text-white/50">
                      Page {currentPage} of {Math.ceil(totalResults / pageSize)}
                    </span>
                    <button
                      onClick={() => handleSearch(currentQuery, currentType, currentPage + 1)}
                      disabled={currentPage >= Math.ceil(totalResults / pageSize)}
                      className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <span className="font-sans text-[11px] text-white/40">
                  Showing {results.data.length} of {totalResults.toLocaleString()} results
                </span>
                {currentType === "send" && results.data.length < totalResults && !isLoadingMore && (
                  <span className="font-sans text-[11px] text-[#3A2AEE]">
                    Scroll for more
                  </span>
                )}
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

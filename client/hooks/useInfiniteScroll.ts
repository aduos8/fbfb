import { useEffect, useRef, useCallback, useState } from "react";

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

export function useInfiniteScroll<T>(
  fetchMore: (page: number) => Promise<{ items: T[]; hasMore: boolean } | null>,
  options: UseInfiniteScrollOptions = {}
) {
  const { threshold = 0.1, rootMargin = "100px", enabled = true } = options;
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchMore(page + 1);
      if (result) {
        setItems(prev => [...prev, ...result.items]);
        setHasMore(result.hasMore);
        setPage(prev => prev + 1);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load more"));
    } finally {
      setIsLoading(false);
    }
  }, [fetchMore, page, isLoading, hasMore, enabled]);

  const reset = useCallback((initialItems?: T[]) => {
    setItems(initialItems || []);
    setPage(1);
    setHasMore(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled, hasMore, isLoading, loadMore, threshold, rootMargin]);

  return {
    items,
    setItems,
    sentinelRef,
    hasMore,
    isLoading,
    error,
    loadMore,
    reset,
  };
}

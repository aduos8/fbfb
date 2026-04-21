import { useEffect, useRef, useCallback, useState } from "react";

interface ScrollOpts {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

export function useInfiniteScroll<T>(
  fetchMore: (page: number) => Promise<{ items: T[]; hasMore: boolean } | null>,
  opts: ScrollOpts = {}
) {
  const { threshold = 0.1, rootMargin = "100px", enabled = true } = opts;
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !enabled) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetchMore(page + 1);
      if (res) {
        setItems(prev => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        setPage(prev => prev + 1);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e : new Error("load failed"));
    } finally {
      setLoading(false);
    }
  }, [fetchMore, page, loading, hasMore, enabled]);

  const reset = useCallback((init?: T[]) => {
    setItems(init || []);
    setPage(1);
    setHasMore(true);
    setErr(null);
  }, []);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) loadMore();
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [enabled, hasMore, loading, loadMore, threshold, rootMargin]);

  return { items, setItems, sentinelRef, hasMore, isLoading: loading, error: err, loadMore, reset };
}

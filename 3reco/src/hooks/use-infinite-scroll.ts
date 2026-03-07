import { useEffect, useRef } from 'react';

/**
 * Hook that triggers a callback when the user scrolls near the bottom of a container
 * @param callback - Function to call when near bottom is reached
 * @param hasMore - Whether there is more data to load
 * @param threshold - Distance from bottom in pixels to trigger the callback (default: 200)
 */
export function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean,
  threshold: number = 200
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore) {
          callback();
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    );

    observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [callback, hasMore, threshold]);

  return sentinelRef;
}

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import type { Key, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type VirtualizedPaginatedListProps<T> = {
  items: T[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  getItemKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
  estimateSize?: (index: number) => number;
  overscan?: number;
  gap?: number;
  loadMoreThreshold?: number;
  paddingEnd?: number;
  loadingLabel?: string;
  readyLabel?: string;
};

export function VirtualizedPaginatedList<T>({
  items,
  hasMore,
  isLoadingMore,
  loadMore,
  getItemKey,
  renderItem,
  className,
  itemClassName,
  estimateSize = () => 120,
  overscan = 5,
  gap = 12,
  loadMoreThreshold = 240,
  paddingEnd = 12,
  loadingLabel = 'Loading more...',
  readyLabel = 'Scroll to load more',
}: VirtualizedPaginatedListProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadRequestRef = useRef<string | null>(null);
  const totalCount = hasMore ? items.length + 1 : items.length;

  // TanStack Virtual exposes imperative methods that trip the React Compiler lint rule.
  // This component keeps that instance local and does not pass it across memoized boundaries.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    paddingEnd,
    getItemKey: (index) =>
      index < items.length ? getItemKey(items[index], index) : '__virtual-loader__',
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useEffect(() => {
    if (!hasMore) {
      loadRequestRef.current = null;
      return;
    }

    const scrollElement = parentRef.current;
    const loaderElement = loaderRef.current;
    if (!scrollElement || !loaderElement || items.length === 0 || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        const requestKey = String(items.length);
        if (loadRequestRef.current === requestKey) {
          return;
        }

        loadRequestRef.current = requestKey;
        loadMore();
      },
      {
        root: scrollElement,
        rootMargin: `0px 0px ${loadMoreThreshold}px 0px`,
        threshold: 0.25,
      }
    );

    observer.observe(loaderElement);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, items.length, loadMore, loadMoreThreshold]);

  useEffect(() => {
    loadRequestRef.current = null;
    const frame = requestAnimationFrame(() => {
      virtualizer.measure();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [items.length, virtualizer]);

  return (
    <div
      ref={parentRef}
      className={cn('min-h-0 overflow-y-auto', className)}
    >
      <div
        className="relative w-full"
        style={{ height: `${totalSize}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const isLoaderRow = virtualItem.index >= items.length;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={
                isLoaderRow
                  ? loaderRef
                  : virtualizer.measureElement
              }
              className={cn('w-full will-change-transform', itemClassName)}
              style={{
                left: 0,
                paddingBottom:
                  !isLoaderRow && virtualItem.index < items.length - 1
                    ? `${gap}px`
                    : undefined,
                position: 'absolute',
                top: 0,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {isLoaderRow ? (
                <div className="flex justify-center py-2 text-sm text-muted-foreground">
                  {isLoadingMore ? loadingLabel : readyLabel}
                </div>
              ) : (
                renderItem(items[virtualItem.index], virtualItem.index)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  endReachedOffset?: number;
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
  estimateSize = () => 136,
  overscan = 5,
  gap = 12,
  endReachedOffset = 2,
  paddingEnd = 12,
  loadingLabel = 'Loading more...',
  readyLabel = 'Scroll to load more',
}: VirtualizedPaginatedListProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
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
    gap,
    paddingEnd,
    getItemKey: (index) =>
      index < items.length ? getItemKey(items[index], index) : '__virtual-loader__',
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastItemIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const loadTriggerIndex = Math.max(items.length - 1 - endReachedOffset, 0);

  useEffect(() => {
    if (!hasMore) {
      loadRequestRef.current = null;
      return;
    }

    if (items.length === 0 || isLoadingMore || lastItemIndex < loadTriggerIndex) {
      return;
    }

    const requestKey = `${items.length}:${loadTriggerIndex}`;
    if (loadRequestRef.current === requestKey) {
      return;
    }

    loadRequestRef.current = requestKey;
    loadMore();
  }, [
    hasMore,
    isLoadingMore,
    items.length,
    lastItemIndex,
    loadMore,
    loadTriggerIndex,
  ]);

  useEffect(() => {
    loadRequestRef.current = null;
    virtualizer.measure();
  }, [items.length, virtualizer]);

  return (
    <div
      ref={parentRef}
      className={cn('min-h-0 overflow-y-auto', className)}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const isLoaderRow = virtualItem.index >= items.length;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={isLoaderRow ? undefined : virtualizer.measureElement}
              className={cn('w-full will-change-transform', itemClassName)}
              style={{
                left: 0,
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

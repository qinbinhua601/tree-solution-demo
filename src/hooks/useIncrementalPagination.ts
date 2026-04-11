import { useCallback, useMemo, useRef, useState } from 'react';

interface SetItemsOptions {
  resetVisibleCount?: boolean;
}

interface AppendItemOptions {
  reveal?: boolean;
}

interface UseIncrementalPaginationOptions {
  initialPageSize: number;
  loadMoreDelay?: number;
}

export function useIncrementalPagination<T>({
  initialPageSize,
  loadMoreDelay = 0,
}: UseIncrementalPaginationOptions) {
  const itemsRef = useRef<T[]>([]);
  const visibleCountRef = useRef(initialPageSize);
  const loadingMoreRef = useRef(false);

  const [items, setItemsState] = useState<T[]>([]);
  const [visibleCount, setVisibleCountState] = useState(initialPageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const setVisibleCount = useCallback((updater: number | ((current: number) => number)) => {
    const nextCount = typeof updater === 'function'
      ? updater(visibleCountRef.current)
      : updater;

    visibleCountRef.current = Math.max(0, nextCount);
    setVisibleCountState(visibleCountRef.current);
    return visibleCountRef.current;
  }, []);

  const setItems = useCallback((nextItems: T[], options?: SetItemsOptions) => {
    const resetVisibleCount = options?.resetVisibleCount ?? false;

    itemsRef.current = nextItems;
    setItemsState(nextItems);

    if (resetVisibleCount) {
      visibleCountRef.current = initialPageSize;
      setVisibleCountState(initialPageSize);
    }
  }, [initialPageSize]);

  const appendItem = useCallback((item: T, options?: AppendItemOptions) => {
    const reveal = options?.reveal ?? false;
    const nextItems = [...itemsRef.current, item];

    itemsRef.current = nextItems;
    setItemsState(nextItems);

    if (reveal) {
      const nextVisibleCount = Math.min(
        Math.max(visibleCountRef.current + 1, initialPageSize),
        nextItems.length,
      );
      visibleCountRef.current = nextVisibleCount;
      setVisibleCountState(nextVisibleCount);
    }

    return nextItems;
  }, [initialPageSize]);

  const removeItems = useCallback((predicate: (item: T) => boolean) => {
    const nextItems = itemsRef.current.filter((item) => !predicate(item));

    itemsRef.current = nextItems;
    setItemsState(nextItems);

    const nextVisibleCount = Math.min(visibleCountRef.current, nextItems.length);
    visibleCountRef.current = nextVisibleCount;
    setVisibleCountState(nextVisibleCount);

    return nextItems;
  }, []);

  const getVisibleItems = useCallback((sourceItems?: T[]) => {
    const targetItems = sourceItems ?? itemsRef.current;
    return targetItems.slice(0, visibleCountRef.current);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (visibleCountRef.current >= itemsRef.current.length) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    if (loadMoreDelay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, loadMoreDelay));
    }

    setVisibleCount((current) => Math.min(current + initialPageSize, itemsRef.current.length));

    loadingMoreRef.current = false;
    setIsLoadingMore(false);
  }, [initialPageSize, loadMoreDelay, setVisibleCount]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  return {
    items,
    itemsRef,
    visibleItems,
    visibleCount,
    visibleCountRef,
    totalCount: items.length,
    hasMore: visibleCount < items.length,
    isLoadingMore,
    setItems,
    appendItem,
    removeItems,
    setVisibleCount,
    getVisibleItems,
    loadMore,
  };
}

import { useEffect, type RefObject } from 'react';

interface UseInfiniteScrollTriggerOptions {
  rootRef?: RefObject<Element | null>;
  targetRef: RefObject<Element | null>;
  enabled: boolean;
  onIntersect: () => void;
  rootMargin?: string;
}

export function useInfiniteScrollTrigger({
  rootRef,
  targetRef,
  enabled,
  onIntersect,
  rootMargin = '0px 0px 120px 0px',
}: UseInfiniteScrollTriggerOptions) {
  useEffect(() => {
    const root = rootRef?.current ?? null;
    const target = targetRef.current;

    if (!enabled || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      {
        root,
        rootMargin,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, onIntersect, rootMargin, rootRef, targetRef]);
}

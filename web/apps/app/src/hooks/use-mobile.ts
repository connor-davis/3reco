import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 781;
// Tables switch to cards below this width. With the sidebar open, a table
// needs about 1100px of window to fit without a scrollbar.
const COMPACT_BREAKPOINT = 1100;

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);

      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True on phones. Reads the browser's media query, so no effect is needed. */
export function useIsMobile() {
  return useMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

/** True when there is room for the deal-details column beside a chat. */
export function useIsWide() {
  return useMedia('(min-width: 1360px)');
}

/** True when a wide table would not fit beside the sidebar. */
export function useIsCompact() {
  return useMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
}

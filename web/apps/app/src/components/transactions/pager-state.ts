import { useState } from 'react';
import { ApiError } from '@/lib/api/client';

/** The message to show for a failed call: the API's own words when it sent them. */
export function errorText(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Try again.';
}

type Filters = Record<string, string | undefined>;

/**
 * Cursor paging with Previous and Next, for the list hooks in lib/api. Pass the
 * active search and filters: they ride along in `params`, and the pager goes
 * back to page one whenever they or the selected page size change.
 */
export function usePager(filters: Filters = {}) {
  const [limit, setLimit] = useState(10);
  const key = JSON.stringify(filters);
  const [state, setState] = useState<{ key: string; cursors: string[] }>({
    key,
    cursors: [],
  });
  // A cursor belongs to the filters it was handed out for, so drop stale ones.
  const cursors = state.key === key ? state.cursors : [];

  return {
    params: { ...filters, limit, cursor: cursors.at(-1) },
    hasPrevious: cursors.length > 0,
    pageNumber: cursors.length + 1,
    setLimit: (value: number) => {
      setLimit(value);
      setState({ key, cursors: [] });
    },
    next: (cursor: string) => setState({ key, cursors: [...cursors, cursor] }),
    previous: () => setState({ key, cursors: cursors.slice(0, -1) }),
    reset: () => setState({ key, cursors: [] }),
  };
}

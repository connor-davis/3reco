import { useState } from 'react';
import { ApiError } from '@/lib/api/client';

/** The message to show for a failed call: the API's own words when it sent them. */
export function errorText(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Try again.';
}

/** Cursor paging with Previous and Next, for the list hooks in lib/api. */
export function usePager(limit = 50) {
  const [cursors, setCursors] = useState<string[]>([]);

  return {
    params: { limit, cursor: cursors.at(-1) },
    hasPrevious: cursors.length > 0,
    pageNumber: cursors.length + 1,
    next: (cursor: string) => setCursors((list) => [...list, cursor]),
    previous: () => setCursors((list) => list.slice(0, -1)),
  };
}

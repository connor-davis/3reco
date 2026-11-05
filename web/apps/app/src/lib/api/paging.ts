export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
export interface Paging {
  cursor?: string;
  limit?: number;
}

export function queryString(values: object = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const result = query.toString();
  return result ? `?${result}` : '';
}

export function nextPage<T>(page: Page<T>) {
  return page.has_more ? (page.next_cursor ?? undefined) : undefined;
}

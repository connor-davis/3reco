import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/**
 * What the server says about itself, with no sign-in needed. It is a runtime
 * answer, not a build setting, because one build serves the live site and the
 * demo. While it loads, or if it fails, this is not the demo and nothing shows.
 */
export function useAppConfig() {
  const query = useQuery({
    queryKey: ['app-config'],
    queryFn: ({ signal }) => api<{ demo: boolean }>('/config', { signal }),
    staleTime: Infinity,
    retry: false,
  });

  return { demo: query.data?.demo === true };
}

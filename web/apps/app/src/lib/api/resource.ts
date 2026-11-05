import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { useLiveTopics } from '../live/use-live';
import { api, json } from './client';

export function useResource<T>(
  key: QueryKey,
  path: string,
  topics: string[] = [],
  privateQuery = false,
  enabled = true
) {
  const { user } = useAuth();
  useLiveTopics(
    topics.map((topic) => topic.replace(':me', `:${user?.id ?? ''}`)),
    [key]
  );
  return useQuery({
    queryKey: [...key, ...(privateQuery ? [user?.id] : [])],
    queryFn: ({ signal }) => api<T>(path, { signal }),
    enabled: enabled && (!privateQuery || !!user),
    retry: (count, error) =>
      count < 2 && !('status' in error && Number(error.status) < 500),
  });
}

export function useWrite<Input, Output>(
  path: string | ((input: Input) => string),
  method: string,
  keys: readonly QueryKey[],
  body: (input: Input) => unknown = (input) => input
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) =>
      api<Output>(
        typeof path === 'function' ? path(input) : path,
        json(method, body(input))
      ),
    onSuccess: async () => {
      await Promise.all(
        keys.map((queryKey) => client.invalidateQueries({ queryKey }))
      );
    },
  });
}

export const idPath = (id: string) => encodeURIComponent(id);

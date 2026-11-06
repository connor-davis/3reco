import { useResource } from './resource';
import type * as T from './types';

export function useStats() {
  return useResource<T.Stats>(['stats'], '/stats');
}

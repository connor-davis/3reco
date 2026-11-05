import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useReviews(sellerId: string, params: Paging = {}) {
  return useResource<Page<T.Review>>(
    ['reviews', sellerId, params],
    `/stores/${idPath(sellerId)}/reviews${queryString(params)}`,
    ['market'],
    false,
    !!sellerId
  );
}
export function useReviewSummary(sellerId: string) {
  return useResource<T.ReviewSummary>(
    ['reviews', 'summary', sellerId],
    `/stores/${idPath(sellerId)}/reviews/summary`,
    ['market'],
    false,
    !!sellerId
  );
}
export function useReviewable(sellerId: string) {
  return useResource<{ items: T.Reviewable[] }>(
    ['reviews', 'reviewable', sellerId],
    `/reviews/reviewable${queryString({ seller_id: sellerId })}`,
    ['transactions:me'],
    true,
    !!sellerId
  );
}
export function useCreateReview(transactionId: string) {
  return useWrite<{ rating: number; comment: string }, T.Created>(
    `/transactions/${idPath(transactionId)}/review`,
    'POST',
    [['reviews'], ['stores'], ['listings']]
  );
}
export function useDeleteReview() {
  return useWrite<string, T.Ok>(
    (id) => `/admin/reviews/${idPath(id)}`,
    'DELETE',
    [['reviews'], ['stores'], ['listings']],
    () => undefined
  );
}

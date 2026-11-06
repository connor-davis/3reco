import { useResource, useWrite } from './resource';
import { queryString } from './paging';
import type * as T from './types';

export function useCart(sellerId: string) {
  return useResource<T.Cart>(
    ['cart', sellerId],
    `/cart${queryString({ seller_id: sellerId })}`,
    true,
    !!sellerId
  );
}
export function useSaveCart(sellerId: string) {
  return useWrite<T.CartInput, T.Ok>(
    `/cart${queryString({ seller_id: sellerId })}`,
    'PUT',
    [['cart']]
  );
}
export function useClearCart(sellerId: string) {
  return useWrite<void, T.Ok>(
    `/cart${queryString({ seller_id: sellerId })}`,
    'DELETE',
    [['cart']]
  );
}

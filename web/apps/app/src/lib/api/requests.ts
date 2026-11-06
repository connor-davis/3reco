import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useRequests(
  direction: 'incoming' | 'outgoing',
  params: Paging = {}
) {
  return useResource<Page<T.TradeRequest>>(
    ['requests', direction, params],
    `/requests/${direction}${queryString(params)}`,
    true
  );
}
export function useRequest(id: string) {
  return useResource<T.TradeRequest>(
    ['requests', id],
    `/requests/${idPath(id)}`,
    true,
    !!id
  );
}
export function useCreateRequest() {
  return useWrite<T.RequestInput, T.Created>('/requests/', 'POST', [
    ['requests'],
    ['messages'],
  ]);
}
export function useOffer(id: string) {
  return useWrite<{ items: T.SaleItem[] }, T.Ok>(
    `/requests/${idPath(id)}/offer`,
    'POST',
    [['requests'], ['stock'], ['listings'], ['messages']]
  );
}
export function useAcceptRequest(id: string) {
  return useWrite<void, T.TransactionCreated>(
    `/requests/${idPath(id)}/accept`,
    'POST',
    [
      ['requests'],
      ['transactions'],
      ['stock'],
      ['listings'],
      ['dashboards'],
      ['stats'],
      ['messages'],
    ]
  );
}
export function useRequestAction(
  id: string,
  action: 'decline' | 'withdraw' | 'reject' | 'cancel'
) {
  return useWrite<void, T.Ok>(`/requests/${idPath(id)}/${action}`, 'POST', [
    ['requests'],
    ['stock'],
    ['listings'],
    ['messages'],
  ]);
}

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatusBadge, TradeTypeLabel, TradeParties } from '@/components/badges';
import { Badge } from '@/components/ui/badge';
import {
  counterpartyOf,
  isClosed,
  requestTotal,
} from '@/components/chat/helpers';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { FilterTabs } from '@/components/filters';
import { Toolbar } from '@/components/toolbar';
import { ListRow } from '@/components/list-row';
import { RowActions } from '@/components/row-actions';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { BusinessName } from '@/components/badges';
import { ButtonRow } from '@/components/button-row';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useRequests } from '@/lib/api/requests';
import { useAuth } from '@/lib/auth/use-auth';
import { requestStatuses } from '@/lib/request-status';
import type { RequestStatus, TradeRequest } from '@/lib/api/types';
import {
  formatDate,
  formatKg,
  formatKgNumber,
  formatRand,
  toGrams,
} from '@/lib/format';

export function RequestList({
  direction,
  title,
  description,
  emptyTitle,
}: {
  direction: 'incoming' | 'outgoing';
  title: string;
  description: string;
  emptyTitle: string;
}) {
  const { user } = useAuth();
  const [cursor, setCursor] = useState<string>();
  const query = useRequests(direction, { cursor });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const requests = query.data?.items ?? [];
  const shown = requests.filter(
    (request) =>
      (status === 'all' || request.status === status) &&
      `${counterpartyOf(request, user?.id).name} ${request.items.map((item) => item.material_name).join(' ')} ${request.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const navigate = useNavigate();
  const open = (request: TradeRequest) =>
    void navigate({
      to: '/market/$requestId',
      params: { requestId: request.id },
    });
  const columns: ColumnDef<TradeRequest>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: 'materials',
      header: 'Material(s)',
      meta: { main: true },
      cell: ({ row }) => (
        <span
          className="block truncate"
          title={row.original.items
            .map((item) => item.material_name)
            .join(', ')}
        >
          {row.original.items.map((item) => item.material_name).join(', ')}
        </span>
      ),
    },
    {
      id: 'party',
      header: 'Other party',
      cell: ({ row }) => {
        const other = counterpartyOf(row.original, user?.id);
        return (
          <span className="block max-w-72">
            <BusinessName
              name={other.name}
              verified={other.business_verified}
            />
          </span>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'weight',
      header: 'Weight (kg)',
      meta: { align: 'right' },
      cell: ({ row }) =>
        formatKgNumber(
          row.original.items.reduce(
            (sum, item) =>
              sum + toGrams(item.offer_weight ?? item.requested_weight ?? '0'),
            0
          ) / 1000
        ),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) =>
        row.original.items.some((item) => item.offer_price !== null)
          ? formatRand(requestTotal(row.original))
          : isClosed(row.original)
            ? 'Closed'
            : 'Awaiting offer',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <RowActions
          name={counterpartyOf(row.original, user?.id).name}
          actions={[{ label: 'Open', onSelect: () => open(row.original) }]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mb-6 space-y-4">
        <Toolbar label="Search this page" value={search} onChange={setSearch} />
        <FilterTabs
          label="Status on this page"
          value={status}
          onChange={setStatus}
          options={[
            'all',
            'pending',
            'offered',
            'accepted',
            'rejected',
            'cancelled',
          ].map((value) => ({
            value,
            label:
              value === 'all'
                ? 'All statuses'
                : (requestStatuses[value as RequestStatus]?.label ?? value),
          }))}
        />
      </div>
      <DataState
        query={query}
        isEmpty={!shown.length}
        icon={Inbox}
        emptyTitle={requests.length ? 'No matching requests' : emptyTitle}
        emptyText="Requests appear here when you start trading."
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          onRowClick={open}
          rowLabel={(request) =>
            `View request from ${counterpartyOf(request, user?.id).name}`
          }
          renderCard={(request) => {
            return (
              <ListRow
                to="/market/$requestId"
                params={{ requestId: request.id }}
                layout="record"
                title={request.items
                  .map((item) => item.material_name)
                  .join(', ')}
                subtitle={
                  <TradeParties seller={request.seller} buyer={request.buyer} />
                }
                secondaryValue={formatKg(
                  request.items.reduce(
                    (sum, item) =>
                      sum +
                      toGrams(
                        item.offer_weight ?? item.requested_weight ?? '0'
                      ),
                    0
                  ) / 1000
                )}
                meta={`${formatDate(request.created_at)} · ${request.id.slice(-8).toUpperCase()}`}
                status={
                  <>
                    <StatusBadge dotOnly status={request.status} />
                    <Badge variant="outline">
                      <TradeTypeLabel
                        compact
                        type="b2b"
                        verified={request.seller.business_verified}
                      />
                    </Badge>
                  </>
                }
                value={
                  request.items.some((item) => item.offer_price !== null)
                    ? formatRand(requestTotal(request))
                    : isClosed(request)
                      ? 'Closed'
                      : 'Awaiting offer'
                }
              />
            );
          }}
        />
      </DataState>
      <ButtonRow className="my-6">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        )}
        {query.data?.has_more && (
          <Button
            variant="outline"
            onClick={() => setCursor(query.data?.next_cursor ?? undefined)}
          >
            Next page
          </Button>
        )}
      </ButtonRow>
    </>
  );
}

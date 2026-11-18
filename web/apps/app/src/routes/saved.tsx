import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Bell, Heart, Package, Store as StoreIcon } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { ChipGroup } from '@/components/filters';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useSaved, type SavedFilter } from '@/lib/api/saved';
import { SavedRow } from './-components/saved-row';

const shows = ['all', 'listings', 'searches', 'stores'] as const;
type Show = (typeof shows)[number];

// The chip lives in the address (?show=) so back and forward move between them.
const filterFor: Record<Show, SavedFilter> = {
  all: 'all',
  listings: 'listing',
  searches: 'search',
  stores: 'store',
};

export const Route = createFileRoute('/saved')({
  validateSearch: (raw: Record<string, unknown>): { show?: Show } => ({
    show: shows.find((show) => show === raw.show && show !== 'all'),
  }),
  component: () => (
    <Guarded page="saved">
      <SavedPage />
    </Guarded>
  ),
});

const browse = <LinkButton to="/market">Browse materials</LinkButton>;

// What an empty list says: first when nothing at all is saved, then per chip.
const empties = {
  none: {
    icon: Heart,
    title: 'Nothing saved yet',
    text: 'Tap the heart on a listing to keep it. Save a search to hear about new matches, or follow a store to hear about its new listings.',
    action: browse,
  },
  listings: {
    icon: Package,
    title: 'No saved listings',
    text: 'Tap the heart on a listing to keep it here.',
    action: browse,
  },
  searches: {
    icon: Bell,
    title: 'No saved searches',
    text: 'On the market page, set filters and tap Save search.',
    action: <LinkButton to="/market">Go to the market</LinkButton>,
  },
  stores: {
    icon: StoreIcon,
    title: "You don't follow any stores",
    text: 'Open a store and tap Follow.',
    action: browse,
  },
};

function SavedPage() {
  const show = Route.useSearch().show ?? 'all';
  const navigate = useNavigate();
  const query = useSaved(filterFor[show]);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = query.data?.pages.at(-1)?.counts;
  const total = counts ? counts.listing + counts.search + counts.store : 0;
  const empty = empties[total === 0 || show === 'all' ? 'none' : show];

  const label = (name: string, count?: number) =>
    count === undefined ? name : `${name} (${count})`;

  return (
    <>
      <PageHeader
        title="Saved"
        description="Your saved listings, searches and followed stores. Get alerts for new listings."
      />
      {/* One swipeable row on phones, so the chips never stack. */}
      <div className="overflow-x-auto [scrollbar-width:none]">
        <ChipGroup
          className="max-sm:w-max max-sm:flex-nowrap"
          label="Show saved"
          value={show}
          onChange={(next) =>
            void navigate({
              to: '/saved',
              search: { show: next === 'all' ? undefined : (next as Show) },
            })
          }
          options={[
            { value: 'all', label: label('All', counts && total) },
            { value: 'listings', label: label('Listings', counts?.listing) },
            { value: 'searches', label: label('Searches', counts?.search) },
            { value: 'stores', label: label('Stores', counts?.store) },
          ]}
        />
      </div>
      <div className="mt-4">
        <Panel>
          <DataState
            query={query}
            isEmpty={!items.length}
            icon={empty.icon}
            emptyTitle={empty.title}
            emptyText={empty.text}
            emptyAction={empty.action}
          >
            <div className="divide-y">
              {items.map((item) => (
                <SavedRow key={`${item.kind}:${item.id}`} item={item} />
              ))}
            </div>
            {query.hasNextPage && (
              <Button
                variant="outline"
                className="mt-4 min-h-11 w-full sm:w-auto"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </DataState>
        </Panel>
      </div>
    </>
  );
}

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Heart, Store as StoreIcon } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { ButtonRow } from '@/components/button-row';
import { CardsSkeleton, DataState } from '@/components/data-state';
import { FollowButton } from '@/components/favourite-button';
import { ListRow } from '@/components/list-row';
import { ListingCard } from '@/components/listing-card';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFavouriteListings, useFollowedStores } from '@/lib/api/favourites';
import { SavedSearches } from './-components/saved-searches';

export const Route = createFileRoute('/saved')({
  component: () => (
    <Guarded page="saved">
      <SavedPage />
    </Guarded>
  ),
});

function SavedPage() {
  return (
    <>
      <PageHeader
        title="Saved"
        description="Your saved listings, searches and followed stores. Get alerts for new listings."
      />
      <Tabs defaultValue="listings">
        <TabsList aria-label="Saved items">
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="searches">Searches</TabsTrigger>
          <TabsTrigger value="stores">Stores</TabsTrigger>
        </TabsList>
        <TabsContent value="listings" keepMounted>
          <SavedListings />
        </TabsContent>
        <TabsContent value="searches" keepMounted>
          <SavedSearches />
        </TabsContent>
        <TabsContent value="stores" keepMounted>
          <FollowedStores />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Pager({
  cursor,
  next,
  onChange,
}: {
  cursor?: string;
  next?: string | null;
  onChange: (cursor?: string) => void;
}) {
  if (!cursor && !next) return null;
  return (
    <ButtonRow className="mt-4">
      {cursor && (
        <Button variant="outline" onClick={() => onChange(undefined)}>
          First page
        </Button>
      )}
      {next && (
        <Button variant="outline" onClick={() => onChange(next)}>
          Next page
        </Button>
      )}
    </ButtonRow>
  );
}

function SavedListings() {
  const [cursor, setCursor] = useState<string>();
  const query = useFavouriteListings({ cursor });
  const items = query.data?.items ?? [];

  return (
    <Panel>
      <DataState
        query={query}
        isEmpty={!items.length}
        compact
        icon={Heart}
        emptyTitle="Nothing saved yet"
        emptyText="Tap the heart on a listing to keep it here."
        skeleton={<CardsSkeleton cards={3} />}
      >
        <div className="grid grid-cols-1 gap-x-3 gap-y-5 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
        <Pager
          cursor={cursor}
          next={query.data?.has_more ? query.data.next_cursor : null}
          onChange={setCursor}
        />
      </DataState>
    </Panel>
  );
}

function FollowedStores() {
  const [cursor, setCursor] = useState<string>();
  const query = useFollowedStores({ cursor });
  const items = query.data?.items ?? [];

  return (
    <Panel>
      <DataState
        query={query}
        isEmpty={!items.length}
        compact
        icon={StoreIcon}
        emptyTitle="You don't follow any stores"
        emptyText="Open a store and tap Follow to hear about its new listings."
      >
        <div className="divide-y">
          {items.map((store) => (
            <div key={store.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ListRow
                  to="/market/store/$sellerId"
                  params={{ sellerId: store.id }}
                  media={
                    <PersonAvatar name={store.name} image={store.avatar_url} />
                  }
                  title={store.name}
                  subtitle={[store.city, store.province]
                    .filter(Boolean)
                    .join(', ')}
                />
              </div>
              <FollowButton storeId={store.id} name={store.name} />
            </div>
          ))}
        </div>
        <Pager
          cursor={cursor}
          next={query.data?.has_more ? query.data.next_cursor : null}
          onChange={setCursor}
        />
      </DataState>
    </Panel>
  );
}

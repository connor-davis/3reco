import { Package, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FavouriteButton, FollowButton } from '@/components/favourite-button';
import { ListRow } from '@/components/list-row';
import { errorText } from '@/components/transactions/pager-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/visuals';
import { useDeleteSearch, type SavedSearch } from '@/lib/api/saved-searches';
import type { SavedItem } from '@/lib/api/saved';
import { formatRate } from '@/lib/format';

/** What a saved search looks for, in plain words. */
function priceText(search: SavedSearch) {
  const { min_price: min, max_price: max } = search;
  if (min && max) return `R ${min} – R ${max} per kg`;
  if (min) return `From R ${min} per kg`;
  if (max) return `Up to R ${max} per kg`;
  return 'Any price';
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {children}
    </span>
  );
}

function SearchRow({ search }: { search: SavedSearch }) {
  const remove = useDeleteSearch();

  return (
    <ListRow
      to="/market"
      search={{
        material_id: search.material_id,
        min_price: search.min_price || undefined,
        max_price: search.max_price || undefined,
      }}
      media={
        <Tile>
          <Search aria-hidden="true" className="size-4" />
        </Tile>
      }
      title={search.material_name}
      subtitle={`${priceText(search)} · Alerts on`}
      status={<Badge variant="lilac">Search</Badge>}
      trailing={
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          aria-label={`Delete saved search for ${search.material_name}`}
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(search.id, {
              onError: (error) => toast.error(errorText(error)),
            })
          }
        >
          <Trash2 aria-hidden="true" />
        </Button>
      }
    />
  );
}

/** One saved listing, saved search or followed store, with its own action. */
export function SavedRow({ item }: { item: SavedItem }) {
  const { listing, search, store } = item;

  if (listing) {
    const photo = listing.thumb_url || listing.image_url;

    return (
      <ListRow
        to="/market/listing/$listingId"
        params={{ listingId: listing.id }}
        media={
          photo ? (
            <img
              src={photo}
              alt=""
              loading="lazy"
              className="size-10 rounded-md object-cover"
            />
          ) : (
            <Tile>
              <Package aria-hidden="true" className="size-4" />
            </Tile>
          )
        }
        title={listing.material_name}
        subtitle={`${formatRate(listing.price)} · ${listing.seller_name}`}
        status={<Badge variant="mint">Listing</Badge>}
        trailing={
          <FavouriteButton
            listingId={listing.id}
            name={listing.material_name}
          />
        }
      />
    );
  }

  if (search) return <SearchRow search={search} />;

  if (store) {
    return (
      <ListRow
        to="/market/store/$sellerId"
        params={{ sellerId: store.id }}
        media={<PersonAvatar name={store.name} image={store.avatar_url} />}
        title={store.name}
        subtitle={[store.city, store.province].filter(Boolean).join(', ')}
        status={<Badge variant="sky">Store</Badge>}
        trailing={<FollowButton storeId={store.id} name={store.name} />}
      />
    );
  }

  return null;
}

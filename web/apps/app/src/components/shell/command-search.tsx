import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useListings } from '@/lib/api/listings';
import { useStores } from '@/lib/api/stores';
import { useAuth } from '@/lib/auth/use-auth';
import { formatRate } from '@/lib/format';
import { navFor } from '@/lib/nav';

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Waits a moment after typing stops, so each key does not hit the API. */
function useDebounced(value: string, ms = 250) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}

/**
 * Ctrl+K (Cmd+K on Mac) jumps to a page, a listing or a store. Pages are
 * filtered here; listings and stores are searched by the API.
 */
export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());

  const needle = text.trim().toLowerCase();
  const pages = [
    ...navFor(user?.role ?? null).flatMap((group) => group.links),
    ...(user ? [{ label: 'Profile', to: '/profile', icon: undefined }] : []),
    { label: 'About 3REco', to: '/about', icon: undefined },
  ].filter((page) => page.label.toLowerCase().includes(needle));

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setText('');
        onOpenChange(next);
      }}
      shouldFilter={false}
      title="Search 3REco"
      description="Jump to a page, a material or a store."
    >
      <CommandInput
        placeholder="Search pages, materials and stores"
        value={text}
        onValueChange={setText}
      />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem
                key={page.to}
                value={page.to}
                onSelect={() => go(page.to)}
              >
                {page.icon && <page.icon />}
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {open && q && <SearchResults q={q} go={go} />}
      </CommandList>
    </CommandDialog>
  );
}

/** Mounted only while the box is open and holds text, so nothing loads idle. */
function SearchResults({ q, go }: { q: string; go: (to: string) => void }) {
  const listings = useListings({ q, limit: 8 });
  const stores = useStores({ q, limit: 8 });

  return (
    <>
      {listings.data && listings.data.items.length > 0 && (
        <CommandGroup heading="Listings">
          {listings.data.items.map((listing) => (
            <CommandItem
              key={listing.id}
              value={`listing-${listing.id}`}
              onSelect={() => go(`/market/listing/${listing.id}`)}
            >
              {listing.material_name} · {listing.seller_name}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatRate(listing.price)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {stores.data && stores.data.items.length > 0 && (
        <CommandGroup heading="Stores">
          {stores.data.items.map((store) => (
            <CommandItem
              key={store.id}
              value={`store-${store.id}`}
              onSelect={() => go(`/market/store/${store.id}`)}
            >
              {store.name}
              <span className="ml-auto text-xs text-muted-foreground">
                {store.city}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );
}

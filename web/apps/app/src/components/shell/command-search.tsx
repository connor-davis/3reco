import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { formatRate } from '@/lib/format';
import { lowestRate } from '@/lib/data/listings';
import { materialById } from '@/lib/data/materials';
import { storeById, stores } from '@/lib/data/stores';
import { navFor } from '@/lib/nav';
import { useMock, useMarketListings } from '@/lib/mock/hooks';

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Ctrl+K (Cmd+K on Mac) jumps to a page, a listing or a store. cmdk does
 * the keyboard handling and fuzzy matching (a deliberate change from 05's
 * plain substring match).
 */
export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const navigate = useNavigate();
  const { role } = useMock();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const pages = navFor(role).flatMap((group) => group.links);
  const signedIn = role !== 'signed-out';
  const listings = useMarketListings().filter((listing) => listing.listed);

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search 3REco"
      description="Jump to a page, a material or a store."
    >
      <CommandInput placeholder="Search pages, materials and stores" />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem
              key={page.to}
              value={page.label}
              onSelect={() => go(page.to)}
            >
              <page.icon />
              {page.label}
            </CommandItem>
          ))}
          {signedIn && (
            <CommandItem value="Profile" onSelect={() => go('/profile')}>
              Profile
            </CommandItem>
          )}
          <CommandItem value="About 3REco" onSelect={() => go('/about')}>
            About 3REco
          </CommandItem>
        </CommandGroup>
        {signedIn && (
          <>
            <CommandGroup heading="Listings">
              {listings.map((listing) => (
                <CommandItem
                  key={listing.id}
                  value={`${listing.title} ${materialById(listing.materialId).name}`}
                  onSelect={() => go(`/market/listing/${listing.id}`)}
                >
                  {listing.title}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRate(lowestRate(listing))}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Stores">
              {stores.map((store) => (
                <CommandItem
                  key={store.id}
                  value={`${store.name} ${storeById(store.id).suburb}`}
                  onSelect={() => go(`/market/store/${store.id}`)}
                >
                  {store.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {store.suburb}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

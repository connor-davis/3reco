import { BellPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorText } from '@/components/transactions/pager-state';
import { useCanSave } from '@/lib/api/favourites';
import { useSaveSearch } from '@/lib/api/saved-searches';
import { priceRangeError, type MarketSearch } from './market-search';

/**
 * Save the current material and prices; text and distance do not affect alerts.
 * The default shows the button with a note. The sheet variant is the same
 * inside the Filters sheet on a phone only (wide screens have the header
 * button). The header variant is a short "Save search" for the results row.
 */
export function SaveSearch({
  search,
  variant = 'note',
}: {
  search: MarketSearch;
  variant?: 'note' | 'sheet' | 'header';
}) {
  const canSave = useCanSave();
  const save = useSaveSearch();
  if (!canSave) return null;

  const header = variant === 'header';
  const button = (
    <Button
      variant="outline"
      className={header ? 'ml-auto max-lg:hidden' : undefined}
      disabled={
        !search.material_id ||
        !!priceRangeError(search.min_price, search.max_price) ||
        save.isPending
      }
      onClick={() =>
        save.mutate(
          {
            material_id: search.material_id!,
            min_price: search.min_price ?? '',
            max_price: search.max_price ?? '',
          },
          {
            onSuccess: () => toast.success('Search saved. Manage it in Saved.'),
            onError: (error) => toast.error(errorText(error)),
          }
        )
      }
    >
      <BellPlus aria-hidden="true" />
      {save.isPending ? 'Saving…' : header ? 'Save search' : 'Save this search'}
    </Button>
  );
  if (header) return button;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm ${
        variant === 'sheet' ? 'lg:hidden' : 'mb-6'
      }`}
    >
      {button}
      <p className="text-muted-foreground">
        {search.material_id
          ? 'Alerts match this material and price range. Text and distance are not included.'
          : 'Choose a material to get alerts for new matches.'}
      </p>
    </div>
  );
}

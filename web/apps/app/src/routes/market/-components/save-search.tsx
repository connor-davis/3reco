import { BellPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorText } from '@/components/transactions/pager-state';
import { useCanSave } from '@/lib/api/favourites';
import { useSaveSearch } from '@/lib/api/saved-searches';
import { priceRangeError, type MarketSearch } from './market-search';

/** Save the current material and prices; text and distance do not affect alerts. */
export function SaveSearch({ search }: { search: MarketSearch }) {
  const canSave = useCanSave();
  const save = useSaveSearch();
  if (!canSave) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <Button
        variant="outline"
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
              onSuccess: () =>
                toast.success('Search saved. Manage it in Saved.'),
              onError: (error) => toast.error(errorText(error)),
            }
          )
        }
      >
        <BellPlus aria-hidden="true" />
        {save.isPending ? 'Saving…' : 'Save this search'}
      </Button>
      <p className="text-muted-foreground">
        {search.material_id
          ? 'Alerts match this material and price range. Text and distance are not included.'
          : 'Choose a material to get alerts for new matches.'}
      </p>
    </div>
  );
}

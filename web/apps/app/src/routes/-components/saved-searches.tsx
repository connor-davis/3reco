import { Link } from '@tanstack/react-router';
import { Bell, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataState } from '@/components/data-state';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { errorText } from '@/components/transactions/pager-state';
import { useDeleteSearch, useSavedSearches } from '@/lib/api/saved-searches';

/** Personal searches and the controls to open or remove them. */
export function SavedSearches() {
  const query = useSavedSearches();
  const remove = useDeleteSearch();
  const items = query.data?.items ?? [];

  return (
    <Panel title="Saved searches">
      <p className="mb-3 text-sm text-muted-foreground">
        Get one alert when a new listing matches a material and price range.
      </p>
      <DataState
        query={query}
        isEmpty={!items.length}
        icon={Bell}
        emptyTitle="No saved searches yet"
        emptyText="Choose a material and price range in the market, then tap Save this search."
      >
        <div className="divide-y">
          {items.map((search) => (
            <div key={search.id} className="flex items-center gap-2 py-3">
              <Link
                to="/market"
                search={{
                  material_id: search.material_id,
                  min_price: search.min_price || undefined,
                  max_price: search.max_price || undefined,
                }}
                className="min-w-0 flex-1 rounded-md p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="break-words font-medium">
                  {search.material_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {search.min_price && search.max_price
                    ? `R ${search.min_price} – R ${search.max_price} per kg`
                    : search.min_price
                      ? `From R ${search.min_price} per kg`
                      : search.max_price
                        ? `Up to R ${search.max_price} per kg`
                        : 'Any price'}
                </p>
              </Link>
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
            </div>
          ))}
        </div>
      </DataState>
    </Panel>
  );
}

import { Package } from 'lucide-react';
import { nextPage, type Page } from '@/lib/api/paging';
import type { usePager } from './pager-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChoiceSelect } from '@/components/filters';
import { plural } from '@/lib/format';

type PagerProps = {
  pager: ReturnType<typeof usePager>;
  page?: Page<unknown>;
  total?: number;
  disabled?: boolean;
};

/** Record count, page size and cursor navigation share one wrapping footer. */
export function Pager({ pager, page, total, disabled = false }: PagerProps) {
  const next = page ? nextPage(page) : undefined;
  const rows = page?.items.length ?? 0;

  if (!rows && !pager.hasPrevious && total === undefined) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      {total !== undefined && <span>{plural(total, 'record')}</span>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {(rows > 0 || pager.hasPrevious) && (
          <div className="flex items-center gap-2">
            <span className="max-sm:hidden">Rows per page</span>
            <ChoiceSelect
              label="Rows per page"
              value={String(pager.params.limit)}
              options={['10', '20', '30', '40', '50']}
              onChange={(value) => pager.setLimit(Number(value))}
              className="min-w-16"
              disabled={disabled}
            />
          </div>
        )}
        <span>
          {total === undefined
            ? `Page ${pager.pageNumber}`
            : `${rows ? (pager.pageNumber - 1) * pager.params.limit + 1 : 0}–${(pager.pageNumber - 1) * pager.params.limit + rows} of ${total}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !pager.hasPrevious}
          onClick={pager.previous}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !rows || !next}
          onClick={() => next && pager.next(next)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** Neutral stand-in for a material photo: the API has no images for materials. */
export function MaterialMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-muted text-muted-foreground',
        className
      )}
    >
      <Package className="size-1/2" strokeWidth={1.25} />
    </div>
  );
}

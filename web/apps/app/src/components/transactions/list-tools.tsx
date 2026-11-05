import { Package } from 'lucide-react';
import { nextPage, type Page } from '@/lib/api/paging';
import type { usePager } from './pager-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PagerProps = {
  pager: ReturnType<typeof usePager>;
  page?: Page<unknown>;
};

/** Previous and Next buttons. Hidden while there is only one page. */
export function Pager({ pager, page }: PagerProps) {
  const next = page ? nextPage(page) : undefined;

  if (!pager.hasPrevious && !next) return null;

  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>Page {pager.pageNumber}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={!pager.hasPrevious}
        onClick={pager.previous}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!next}
        onClick={() => next && pager.next(next)}
      >
        Next
      </Button>
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

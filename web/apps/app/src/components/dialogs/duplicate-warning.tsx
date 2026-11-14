import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CollectionMatch } from '@/lib/api/types';
import { formatDate, formatKg, formatRand, toCents } from '@/lib/format';

type Props = {
  matches: CollectionMatch[] | null;
  pending: boolean;
  onBack: () => void;
  onSaveAnyway: () => void;
};

/** Asks for a second yes when a new collection looks like one already recorded. */
export function DuplicateWarning({
  matches,
  pending,
  onBack,
  onSaveAnyway,
}: Props) {
  return (
    <AlertDialog
      open={matches !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onBack();
      }}
    >
      <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            This looks like a collection you already recorded
          </AlertDialogTitle>
          <AlertDialogDescription>
            It shares at least one line with the collection
            {matches && matches.length > 1 ? 's' : ''} below from the same
            collector. Save it only if this is a new delivery.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-4 text-sm">
          {(matches ?? []).map((match) => (
            <li key={match.id} className="space-y-1 border-b pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  Invoice {match.invoice_number}
                </span>
                {match.exact_copy && <Badge>Exact copy</Badge>}
              </div>
              <p className="text-muted-foreground">
                {formatDate(match.effective_at)} ·{' '}
                {formatRand(toCents(match.total_price))}
              </p>
              <ul className="tabular-nums">
                {match.matching_lines.map((line, index) => (
                  <li key={index}>
                    {line.material_name} · {formatKg(line.weight)} ·{' '}
                    {formatRand(toCents(line.price))} / kg
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} autoFocus>
            Go back
          </AlertDialogCancel>
          <Button disabled={pending} onClick={onSaveAnyway}>
            Save anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

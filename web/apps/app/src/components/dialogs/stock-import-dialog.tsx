import { useState } from 'react';
import { toast } from 'sonner';
import { Download, TriangleAlert } from 'lucide-react';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api/client';
import { useCommitStockImport, usePreviewStockImport } from '@/lib/api/stock';
import type { StockImportLine, StockImportRow } from '@/lib/api/types';
import { plural } from '@/lib/format';

const columns: { key: keyof StockImportRow; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'weight_kg', label: 'Weight (kg)' },
  { key: 'price_per_kg', label: 'Price per kg (R)' },
  { key: 'listed', label: 'Listed (yes or no)' },
  { key: 'fulfillment', label: 'Pickup or delivery' },
  { key: 'pickup_area', label: 'Town or area' },
];

const sample =
  'material,weight_kg,price_per_kg,listed,fulfillment,pickup_area\n' +
  'Glass,250.5,1.20,yes,pickup,Durban\n' +
  'Copper,40,85.00,no,both,\n';

const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`;

const cells = (line: StockImportLine): StockImportRow => ({
  material: line.material,
  weight_kg: line.weight_kg,
  price_per_kg: line.price_per_kg,
  listed: line.listed,
  fulfillment: line.fulfillment,
  pickup_area: line.pickup_area,
});

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Upload a stock CSV, fix the marked cells, then publish every line at once. */
export function StockImportDialog(props: Props) {
  return props.open ? <ImportForm {...props} /> : null;
}

function ImportForm({ open, onOpenChange }: Props) {
  const preview = usePreviewStockImport();
  const commit = useCommitStockImport();
  const [lines, setLines] = useState<StockImportLine[] | null>(null);
  // True from the first edit until the server has checked the new cells.
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');

  const problems = lines?.filter((line) => Object.keys(line.errors).length);
  const busy = preview.isPending || commit.isPending;
  const canPublish = !!lines && !problems?.length && !stale && !busy;

  function show(next: { rows: StockImportLine[] }) {
    setLines(next.rows);
    setStale(false);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    preview.mutate(file, {
      onSuccess: show,
      onError: (failure) => setError(errorText(failure)),
    });
  }

  function edit(index: number, key: keyof StockImportRow, value: string) {
    setStale(true);
    setLines((current) =>
      (current ?? []).map((line, at) =>
        at === index ? { ...line, [key]: value } : line
      )
    );
  }

  // Checking only happens when someone leaves a cell, not on every key.
  function recheck() {
    if (!lines || !stale || busy) return;
    setError('');
    preview.mutate(lines.map(cells), {
      onSuccess: show,
      onError: (failure) => setError(errorText(failure)),
    });
  }

  function publish() {
    if (!lines || !canPublish) return;
    setError('');
    commit.mutate(lines.map(cells), {
      onSuccess: (done) => {
        toast.success(`${plural(done.count, 'line')} published.`);
        onOpenChange(false);
      },
      onError: (failure) => {
        const marked =
          failure instanceof ApiError &&
          (failure.details as { rows?: StockImportLine[] } | undefined)?.rows;
        if (marked) show({ rows: marked });
        setError(errorText(failure));
      },
    });
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Import stock from a CSV"
      description="Add many lines at once. Nothing is saved until every line is right."
      wide
      footer={
        lines && (
          <div className="w-full space-y-2">
            <div className="min-h-10" role="status">
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : problems?.length ? (
                <p className="text-sm text-muted-foreground">
                  Fix {plural(problems.length, 'line')} to publish.
                </p>
              ) : stale || preview.isPending ? (
                <p className="text-sm text-muted-foreground">Checking…</p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setLines(null);
                  setStale(false);
                  setError('');
                }}
              >
                Choose another file
              </Button>
              <Button disabled={!canPublish} onClick={publish}>
                Publish {plural(lines.length, 'line')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {lines ? (
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            {plural(lines.length, 'line')}.{' '}
            {problems?.length
              ? `${plural(problems.length, 'line')} need fixing. Change a cell and tap outside it to check again.`
              : 'All lines look good.'}
          </p>
          <div className="min-w-0 max-w-full">
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {columns.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell className="align-top">
                      {Object.keys(line.errors).length ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <TriangleAlert className="size-4" aria-hidden />
                          <span className="sr-only">Line </span>
                          {index + 1}
                        </span>
                      ) : (
                        index + 1
                      )}
                    </TableCell>
                    {columns.map((column) => {
                      const message = line.errors[column.key];
                      return (
                        <TableCell
                          key={column.key}
                          className="min-w-32 align-top"
                        >
                          <Input
                            value={line[column.key]}
                            aria-label={`${column.label}, line ${index + 1}`}
                            aria-invalid={!!message}
                            disabled={busy}
                            inputMode={
                              column.key === 'weight_kg' ||
                              column.key === 'price_per_kg'
                                ? 'decimal'
                                : undefined
                            }
                            onChange={(event) =>
                              edit(index, column.key, event.target.value)
                            }
                            onBlur={recheck}
                          />
                          {message && (
                            <p className="mt-1 text-xs text-destructive">
                              {message}
                            </p>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            Use one line for each stock item. The first row names the columns:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">material</strong>: the name
              from the Materials page, or its id.
            </li>
            <li>
              <strong className="text-foreground">weight_kg</strong> and{' '}
              <strong className="text-foreground">price_per_kg</strong>: numbers
              with a dot, such as 12.50.
            </li>
            <li>
              <strong className="text-foreground">listed</strong>: yes to show
              it in the market. Leave blank for no.
            </li>
            <li>
              <strong className="text-foreground">fulfillment</strong>: pickup,
              delivery or both. Leave blank to skip.
            </li>
            <li>
              <strong className="text-foreground">pickup_area</strong>: a town
              or area. Leave blank to skip.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Up to 500 lines and 1 MB per file.
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={sampleHref} download="stock-sample.csv" />}
          >
            <Download data-icon="inline-start" />
            Download a sample
          </Button>
          <div>
            <label htmlFor="stock-csv" className="mb-2 block font-medium">
              Choose your CSV file
            </label>
            <Input
              id="stock-csv"
              type="file"
              accept=".csv,text/csv"
              disabled={preview.isPending}
              onChange={(event) => pick(event.target.files?.[0])}
            />
          </div>
          {preview.isPending && (
            <p role="status" className="text-muted-foreground">
              Checking your file…
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </ResponsiveOverlay>
  );
}

import { useState, type ReactNode } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type RowData,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useIsCompact } from '@/hooks/use-mobile';

declare module '@tanstack/react-table' {
  // Numeric columns keep the same edge in both their heading and cells.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right';
    sticky?: 'left' | 'right';
  }
}

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  // On phones every row becomes one card (map section 8.4).
  renderCard: (row: T) => ReactNode;
  footer?: ReactNode;
};

/**
 * The shadcn Table with TanStack Table doing columns and sorting. Below
 * 1100px the same rows render as cards, so nothing scrolls sideways.
 */
export function DataTable<T>({
  columns,
  data,
  renderCard,
  footer,
}: DataTableProps<T>) {
  const compact = useIsCompact();
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      {compact ? (
        <ul className="grid gap-3">
          {rows.map((row: Row<T>) => (
            <li key={row.id}>{renderCard(row.original)}</li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow
                  key={group.id}
                  className="group bg-background [--row-background:var(--background)] hover:[--row-background:color-mix(in_oklab,var(--muted)_50%,var(--background))]"
                >
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.columnDef.meta?.align === 'right' &&
                          'text-right tabular-nums',
                        header.column.columnDef.meta?.sticky &&
                          'sticky z-20 bg-[var(--row-background)] border-border',
                        header.column.columnDef.meta?.sticky === 'left' &&
                          'left-0 border-r',
                        header.column.columnDef.meta?.sticky === 'right' &&
                          'right-0 border-l'
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <SortButton
                          direction={header.column.getIsSorted()}
                          align={header.column.columnDef.meta?.align}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </SortButton>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group bg-background [--row-background:var(--background)] hover:[--row-background:color-mix(in_oklab,var(--muted)_50%,var(--background))] data-[state=selected]:[--row-background:var(--muted)] has-aria-expanded:[--row-background:color-mix(in_oklab,var(--muted)_50%,var(--background))]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.columnDef.meta?.align === 'right' &&
                          'text-right whitespace-nowrap tabular-nums',
                        cell.column.columnDef.meta?.sticky &&
                          'sticky z-10 bg-[var(--row-background)] border-border transition-colors',
                        cell.column.columnDef.meta?.sticky === 'left' &&
                          'left-0 border-r',
                        cell.column.columnDef.meta?.sticky === 'right' &&
                          'right-0 border-l'
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

type SortButtonProps = {
  align?: 'left' | 'right';
  direction: false | 'asc' | 'desc';
  onClick?: (event: unknown) => void;
  children: ReactNode;
};

function SortButton({ direction, onClick, children, align }: SortButtonProps) {
  const Icon =
    direction === 'asc'
      ? ArrowUp
      : direction === 'desc'
        ? ArrowDown
        : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={align === 'right' ? '-mr-3' : '-ml-3'}
      onClick={onClick}
    >
      {children}
      <Icon data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

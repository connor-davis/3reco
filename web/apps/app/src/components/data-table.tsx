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
import { Panel } from '@/components/panel';
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
    // Flexible columns share spare width; className can allow wrapping.
    main?: boolean;
    className?: string;
  }
}

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  // Compact lists share one divided surface.
  renderCard: (row: T) => ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  // The server orders the rows: one column, either way round, never unsorted.
  serverSort?: { id: string; desc: boolean; onChange: (desc: boolean) => void };
};

/**
 * The shadcn Table with TanStack Table doing columns and sorting. Below
 * 1024px the same data renders as list rows, so nothing scrolls sideways.
 */
export function DataTable<T>({
  columns,
  data,
  renderCard,
  footer,
  serverSort,
  onRowClick,
  rowLabel,
}: DataTableProps<T>) {
  const compact = useIsCompact();
  const [sorting, setSorting] = useState<SortingState>([]);
  const active: SortingState = serverSort
    ? [{ id: serverSort.id, desc: serverSort.desc }]
    : sorting;

  const table = useReactTable({
    data,
    columns,
    state: { sorting: active },
    manualSorting: !!serverSort,
    enableSortingRemoval: !serverSort,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(active) : updater;
      if (serverSort) serverSort.onChange(next[0]?.desc ?? false);
      else setSorting(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  if (compact) {
    return (
      <Panel>
        <ul className="divide-y">
          {rows.map((row: Row<T>) => (
            <li key={row.id}>{renderCard(row.original)}</li>
          ))}
        </ul>
        {footer && <div className={footerClass}>{footer}</div>}
      </Panel>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-muted/50">
      <div className="min-w-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="group hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getCanSort()
                        ? header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                    className={cn(
                      'h-11 bg-transparent text-xs font-medium text-muted-foreground',
                      edge(header.index, group.headers.length),
                      header.column.columnDef.meta?.main
                        ? 'w-full max-w-0'
                        : 'w-px whitespace-nowrap',
                      header.column.columnDef.meta?.className,
                      header.column.columnDef.meta?.align === 'right' &&
                        'text-right tabular-nums'
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
                className={cn(
                  'group hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
                  onRowClick && 'cursor-pointer'
                )}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={rowLabel?.(row.original)}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === 'Enter' || event.key === ' ')
                        ) {
                          event.preventDefault();
                          onRowClick(row.original);
                        }
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell, index, cells) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'py-3.5 text-sm',
                      edge(index, cells.length),
                      cell.column.columnDef.meta?.main
                        ? 'w-full max-w-0 truncate'
                        : 'w-px whitespace-nowrap',
                      cell.column.columnDef.meta?.className,
                      cell.column.columnDef.meta?.align === 'right' &&
                        'text-right tabular-nums'
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {footer && <div className={cn(footerClass, 'px-6 py-4')}>{footer}</div>}
    </section>
  );
}

const footerClass =
  'flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground';

// The first cell sits 24px in, the last 24px from the edge, the rest 16px.
function edge(index: number, count: number) {
  return cn('px-4', index === 0 && 'pl-6', index === count - 1 && 'pr-6');
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

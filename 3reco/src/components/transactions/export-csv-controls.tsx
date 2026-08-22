import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { downloadCsv } from '@/lib/export-csv';
import { cn } from '@/lib/utils';
import { DownloadIcon } from 'lucide-react';

/** 'transaction' = one row per transaction. 'material' = one row per material line. */
export type ExportRowFormat = 'transaction' | 'material';

const FORMAT_LABELS: Record<ExportRowFormat, string> = {
  transaction: 'One row per transaction',
  material: 'One row per material',
};

type ExportCsvControlsProps = {
  /** Rows straight from the matching `api.exports.*` query. */
  rows: readonly Record<string, unknown>[] | undefined;
  format: ExportRowFormat;
  onFormatChange: (format: ExportRowFormat) => void;
  /** Filename without extension, e.g. 'transactions'. */
  filenameBase: string;
  /** Set for the stacked, full-width layout inside PageHeaderActions. */
  fullWidth?: boolean;
  size?: 'default' | 'sm';
};

export default function ExportCsvControls({
  rows,
  format,
  onFormatChange,
  filenameBase,
  fullWidth = false,
  size = 'default',
}: ExportCsvControlsProps) {
  const isEmpty = !rows || rows.length === 0;
  const filename =
    format === 'material' ? `${filenameBase}-itemised.csv` : `${filenameBase}.csv`;

  return (
    <>
      <Select
        value={format}
        onValueChange={(value) => onFormatChange(value as ExportRowFormat)}
      >
        <SelectTrigger
          size={size}
          className={cn(fullWidth ? 'w-full' : 'w-auto')}
          aria-label="CSV row format"
        >
          <SelectValue>{FORMAT_LABELS[format]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="transaction">{FORMAT_LABELS.transaction}</SelectItem>
          <SelectItem value="material">{FORMAT_LABELS.material}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size={size}
        className={cn(fullWidth && 'w-full')}
        disabled={isEmpty}
        onClick={() => rows && downloadCsv(rows as Record<string, unknown>[], filename)}
      >
        <DownloadIcon className="size-4" />
        Download CSV
      </Button>
    </>
  );
}

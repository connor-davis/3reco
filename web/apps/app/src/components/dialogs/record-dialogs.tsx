import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useUploadReceipt, useDownloadReceipt } from '@/lib/api/receipts';
import { useDownloadInvoice, useTransaction } from '@/lib/api/transactions';
import type { Transaction } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  lineCents,
  toCents,
} from '@/lib/format';

type Props = {
  record: Transaction | null;
  onClose: () => void;
};

export const maxReceipts = 5;
const maxBytes = 5 * 1024 * 1024;
const kinds = ['image/png', 'image/jpeg'];

/** One trade: who, when, every line, the invoice and its receipts. */
export function TransactionDialog({ record, onClose }: Props) {
  const { user } = useAuth();
  const fresh = useTransaction(record?.id ?? '');
  const upload = useUploadReceipt(record?.id ?? '');
  const download = useDownloadReceipt(record?.id ?? '');
  const invoice = useDownloadInvoice();
  const [fileError, setFileError] = useState('');
  const shown = fresh.data ?? record;

  // Anyone who can open the trade may see its invoice and receipts, but only
  // the people in it add receipts: not staff, and not the collector.
  const canUpload =
    !!shown &&
    !!user &&
    (shown.buyer.id === user.id ||
      (shown.type === 'b2b' && shown.seller.id === user.id));

  function pick(file: File | undefined) {
    setFileError('');
    if (!file) return;

    if (!kinds.includes(file.type)) {
      setFileError('Choose a PNG or JPEG picture.');
      return;
    }

    if (file.size > maxBytes) {
      setFileError('The picture is over 5 MB.');
      return;
    }

    upload.mutate(file, {
      onSuccess: () => toast.success('Receipt added.'),
      onError: (error) => setFileError(errorText(error)),
    });
  }

  return (
    <ResponsiveOverlay
      open={record !== null}
      onOpenChange={(open) => !open && onClose()}
      wide
      title={shown ? `Invoice ${shown.invoice_number}` : 'Transaction'}
      description="The lines, the invoice and the receipts for this trade."
      footer={
        shown && (
          <Button
            disabled={invoice.isPending}
            onClick={() =>
              invoice.mutate(shown, {
                onError: (error) => toast.error(errorText(error)),
              })
            }
          >
            <Download data-icon="inline-start" />
            Download invoice
          </Button>
        )
      }
    >
      {shown && (
        <div className="space-y-4">
          <dl className="space-y-2 text-sm">
            <Line label="Seller" value={shown.seller.name} />
            <Line label="Buyer" value={shown.buyer.name} />
            <Line
              label="Date"
              value={formatDate(shown.collection_day ?? shown.effective_at)}
            />
          </dl>
          <Separator />
          <ul className="space-y-2 text-sm">
            {shown.items.map((item) => (
              <li key={item.material_id} className="flex justify-between gap-4">
                <span>
                  <span className="block font-medium">
                    {item.material_name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatKg(item.weight)} · {formatRate(item.price)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatRand(lineCents(item.price, item.weight))}
                </span>
              </li>
            ))}
          </ul>
          <Separator />
          <dl>
            <Line
              label="Total"
              value={formatRand(toCents(shown.total_price))}
            />
          </dl>
          <>
            <Separator />
            <section aria-label="Receipts" className="space-y-3">
              <h3 className="font-medium">
                Receipts ({shown.receipts.length} of {maxReceipts})
              </h3>
              {shown.receipts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No receipts yet.
                </p>
              )}
              <ul className="space-y-2">
                {shown.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {receipt.file_name}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        download.mutate(receipt, {
                          onError: (error) => toast.error(errorText(error)),
                        })
                      }
                    >
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
              {canUpload && shown.receipts.length < maxReceipts && (
                <Field data-invalid={fileError !== ''}>
                  <FieldLabel htmlFor="receipt-file">Add a receipt</FieldLabel>
                  <Input
                    id="receipt-file"
                    type="file"
                    accept="image/png,image/jpeg"
                    disabled={upload.isPending}
                    aria-invalid={fileError !== ''}
                    onChange={(event) => {
                      pick(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <FieldDescription>
                    PNG or JPEG, up to 5 MB. Up to {maxReceipts} receipts.
                  </FieldDescription>
                  {fileError && (
                    <p role="alert" className="text-sm text-destructive">
                      {fileError}
                    </p>
                  )}
                </Field>
              )}
            </section>
          </>
        </div>
      )}
    </ResponsiveOverlay>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

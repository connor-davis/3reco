import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText, MoreHorizontal, Upload } from 'lucide-react';
import { BusinessName, StatusBadge, TradeTypeLabel } from '@/components/badges';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Panel } from '@/components/panel';
import { LinkButton } from '@/components/link-button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import {
  kinds,
  maxBytes,
  maxReceipts,
  useUploadReceipt,
  useDownloadReceipt,
  useDeleteReceipt,
} from '@/lib/api/receipts';
import {
  useDownloadInvoice,
  useDownloadRecord,
  useTransaction,
} from '@/lib/api/transactions';
import { api, ApiError } from '@/lib/api/client';
import { useSaveCart } from '@/lib/api/cart';
import { queryString, type Page } from '@/lib/api/paging';
import type { Cart, Listing, Receipt, Transaction } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { mergeReorder } from '@/lib/reorder';
import { cn } from '@/lib/utils';
import {
  formatDate,
  formatKgFixed,
  formatRand,
  formatRate,
  lineCents,
  toCents,
} from '@/lib/format';

type Props = {
  record: Transaction;
};

/** One trade: who, when, every line, the invoice and its receipts. */
export function TradeDetail({ record }: Props) {
  const { user } = useAuth();
  const fresh = useTransaction(record?.id ?? '');
  const upload = useUploadReceipt();
  const download = useDownloadReceipt(record?.id ?? '');
  const remove = useDeleteReceipt(record?.id ?? '');
  const [removing, setRemoving] = useState<Receipt | null>(null);
  const invoice = useDownloadInvoice();
  const recyclingRecord = useDownloadRecord();
  const [fileError, setFileError] = useState('');
  const shown = fresh.data ?? record;
  const navigate = useNavigate();
  const saveCart = useSaveCart(shown.seller.id);
  const [buyingAgain, setBuyingAgain] = useState(false);
  const canBuyAgain =
    user?.role === 'business' &&
    (user.business_role === 'owner' || user.business_role === 'manager') &&
    !!user.active_business_id &&
    shown.buyer.id === user.active_business_id &&
    shown.type === 'b2b' &&
    shown.status === 'complete';

  async function buyAgain() {
    if (!canBuyAgain || buyingAgain) return;

    setBuyingAgain(true);
    try {
      // Read at the tap, rather than overwriting newer cart choices with a cache.
      const seller = { seller_id: shown.seller.id };
      const [cart, ...pages] = await Promise.all([
        api<Cart>(`/cart${queryString(seller)}`),
        ...[...new Set(shown.items.map((item) => item.material_id))].map(
          (material_id) =>
            api<Page<Listing>>(
              `/market/listings${queryString({ ...seller, material_id })}`
            )
        ),
      ]);
      const { lines, skipped } = mergeReorder(
        shown.items,
        pages.flatMap((page) => page.items),
        cart.items
      );

      // A failed save leaves both the saved cart and the current page alone.
      await saveCart.mutateAsync({ items: lines });
      if (skipped.length) {
        toast.info(
          `Not added because they are no longer listed: ${skipped.join(', ')}.`
        );
      }
      await navigate({ to: '/cart', search: seller });
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.fields?.items
          ? error.fields.items
          : errorText(error)
      );
    } finally {
      setBuyingAgain(false);
    }
  }

  // The buyer, a business seller, admins and staff may add receipts.
  // The collector may view receipts but never upload them.
  const canUpload =
    !!shown &&
    !!user &&
    (user.role === 'admin' ||
      user.role === 'staff' ||
      shown.buyer.id === user.id ||
      (shown.type === 'b2b' && shown.seller.id === user.id));

  const storeParty =
    shown.type === 'c2b' || user?.id === shown.seller.id
      ? shown.buyer
      : shown.seller;

  function pick(file: File | undefined) {
    setFileError('');
    if (!file) return;

    if (!kinds.includes(file.type)) {
      setFileError('Choose a PNG or JPEG image.');
      return;
    }

    if (file.size > maxBytes) {
      setFileError('The image is over 5 MB.');
      return;
    }

    upload.mutate(
      { id: record?.id ?? '', file },
      {
        onSuccess: () => toast.success('Receipt added.'),
        onError: (error) => setFileError(errorText(error)),
      }
    );
  }

  return (
    <>
      {shown && (
        <>
          <header className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[26px] font-semibold tracking-tight break-all lg:text-4xl">
                  Invoice {shown.invoice_number}
                </h1>
                <StatusBadge
                  status={
                    shown.status === 'complete'
                      ? 'Complete'
                      : shown.status === 'pending'
                        ? 'Pending'
                        : shown.status === 'duplicate'
                          ? 'Duplicate'
                          : 'Cancelled'
                  }
                />
                <Badge variant="outline">
                  <TradeTypeLabel
                    type={shown.type}
                    verified={shown.business_verified}
                  />
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(shown.collection_day ?? shown.effective_at)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Invoice actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canBuyAgain && (
                  <DropdownMenuItem
                    disabled={buyingAgain}
                    onClick={() => void buyAgain()}
                  >
                    {buyingAgain ? 'Adding to cart…' : 'Buy again'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={invoice.isPending}
                  onClick={() =>
                    invoice.mutate(shown, {
                      onError: (error) => toast.error(errorText(error)),
                    })
                  }
                >
                  Download invoice
                </DropdownMenuItem>
                {shown.status === 'complete' && (
                  <DropdownMenuItem
                    disabled={recyclingRecord.isPending}
                    onClick={() =>
                      recyclingRecord.mutate(shown, {
                        onError: (error) => toast.error(errorText(error)),
                      })
                    }
                  >
                    Recycling record
                  </DropdownMenuItem>
                )}
                {shown.request_id && (
                  <DropdownMenuItem
                    render={
                      <LinkButton
                        variant="ghost"
                        to="/messages/$requestId"
                        params={{ requestId: shown.request_id }}
                      />
                    }
                  >
                    View request
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="order-2 min-w-0 space-y-4 lg:order-1">
              <Panel title="Items">
                <ul className="divide-y text-sm">
                  {shown.items.map((item) => (
                    <li
                      key={item.material_id}
                      className="flex justify-between gap-4 py-4 first:pt-0"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium break-words">
                          {item.material_name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatKgFixed(item.weight)} kg ×{' '}
                          {formatRate(item.price)}
                        </span>
                      </span>
                      <span className="text-right font-medium whitespace-nowrap tabular-nums">
                        {formatRand(lineCents(item.price, item.weight))}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <dl className="pt-4">
                  <Line
                    label="Total"
                    value={formatRand(toCents(shown.total_price))}
                  />
                </dl>
              </Panel>
              <Panel
                title={`Receipts (${shown.receipts.length} of ${maxReceipts} allowed)`}
              >
                <section aria-label="Receipts" className="space-y-3">
                  {shown.receipts.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No receipts yet.
                    </p>
                  )}
                  <ul className="divide-y">
                    {shown.receipts.map((receipt) => (
                      <li
                        key={receipt.id}
                        className="flex items-center gap-3 py-3 text-sm"
                      >
                        <FileText
                          className="size-5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={receipt.file_name}
                        >
                          {receipt.file_name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                aria-label={`Actions for ${receipt.file_name}`}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                download.mutate(receipt, {
                                  onError: (error) =>
                                    toast.error(errorText(error)),
                                })
                              }
                            >
                              Download receipt
                            </DropdownMenuItem>
                            {user &&
                              (receipt.uploaded_by === user.id ||
                                shown.can_remove_receipts) && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  aria-label={`Remove receipt ${receipt.file_name}`}
                                  disabled={remove.isPending}
                                  onClick={() => setRemoving(receipt)}
                                >
                                  Remove
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                  {canUpload && shown.receipts.length < maxReceipts && (
                    <Field
                      className="relative [&>.sr-only]:w-px"
                      data-invalid={fileError !== ''}
                    >
                      <input
                        id="receipt-file"
                        type="file"
                        className="peer sr-only top-0 left-0"
                        accept="image/png,image/jpeg"
                        disabled={upload.isPending}
                        aria-invalid={fileError !== ''}
                        onChange={(event) => {
                          pick(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                      <FieldLabel
                        htmlFor="receipt-file"
                        className={cn(
                          buttonVariants({ variant: 'secondary' }),
                          'w-full cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50',
                          upload.isPending && 'pointer-events-none opacity-50'
                        )}
                      >
                        <Upload data-icon="inline-start" />
                        Add a receipt
                      </FieldLabel>
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
              </Panel>
            </div>
            <aside className="order-1 min-w-0 space-y-4 lg:order-2">
              <Panel title="Summary">
                <dl className="space-y-3">
                  <Line label="Invoice" value={shown.invoice_number} />
                  <Line
                    label="Date"
                    value={formatDate(
                      shown.collection_day ?? shown.effective_at
                    )}
                  />
                  <div className="border-t pt-3">
                    <Line
                      label="Total"
                      value={formatRand(toCents(shown.total_price))}
                    />
                  </div>
                </dl>
              </Panel>
              <Panel title="Parties">
                <dl className="space-y-4">
                  <Line
                    label="Seller"
                    value={
                      <BusinessName
                        name={shown.seller.name}
                        verified={shown.seller.business_verified}
                      />
                    }
                  />
                  <Line
                    label="Buyer"
                    value={
                      <BusinessName
                        name={shown.buyer.name}
                        verified={shown.buyer.business_verified}
                      />
                    }
                  />
                </dl>
                {storeParty.name !== 'Removed account' && (
                  <LinkButton
                    className="mt-4 w-full"
                    variant="secondary"
                    to="/market/store/$sellerId"
                    params={{ sellerId: storeParty.id }}
                  >
                    Visit store
                  </LinkButton>
                )}
              </Panel>
            </aside>
          </div>
        </>
      )}
      <ConfirmDialog
        open={record !== null && removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove receipt?"
        description={`Remove ${removing?.file_name ?? 'this receipt'} from this trade? This cannot be undone.`}
        confirmLabel="Remove receipt"
        onConfirm={() => {
          if (!removing || remove.isPending) return;
          remove.mutate(removing.id, {
            onSuccess: () => toast.success('Receipt removed.'),
            onError: (error) => toast.error(errorText(error)),
          });
          setRemoving(null);
        }}
      />
    </>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{value}</dd>
    </div>
  );
}

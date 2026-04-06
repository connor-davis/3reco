import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatTransactionDateForFileName } from '@/lib/transactions';
import { useConvex } from 'convex/react';
import { DownloadIcon, FileImageIcon, Loader2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const GENERATION_GRACE_MS = 5 * 60 * 1000; // 5 minutes
type ReceiptAttachment = NonNullable<Doc<'transactions'>['receiptAttachments']>[number];

async function downloadFile(
  url: string,
  fileName: string
) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

async function downloadInvoice(
  url: string,
  transactionId: string,
  creationTime: number
) {
  const invoiceNum = transactionId.slice(-8).toUpperCase();
  const date = formatTransactionDateForFileName(creationTime);
  const fileName = `3rEco-Invoice-${invoiceNum}-${date}.pdf`;

  await downloadFile(url, fileName);
}

export function InvoiceDownloadButton({
  transactionId,
  creationTime,
  transactionDate,
}: {
  transactionId: Id<'transactions'>;
  creationTime: number;
  transactionDate?: number;
}) {
  const [renderedAt] = useState(() => Date.now());
  const { data: url, isLoading } = useQuery(
    convexQuery(api.invoices.getInvoiceUrl, { transactionId })
  );

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2Icon className="size-3 animate-spin" />
        <span className="hidden sm:inline">Invoice</span>
      </Button>
    );
  }

  if (!url) {
    const isRecent = renderedAt - creationTime < GENERATION_GRACE_MS;
    if (!isRecent) return null;
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2Icon className="size-3 animate-spin" />
        <span className="hidden sm:inline">Generating...</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        downloadInvoice(url, transactionId, transactionDate ?? creationTime)
      }
    >
      <DownloadIcon className="size-3" />
      <span className="hidden sm:inline">Invoice</span>
    </Button>
  );
}

export function ReceiptDownloadButton({
  transactionId,
  attachments,
}: {
  transactionId: Id<'transactions'>;
  attachments: ReceiptAttachment[];
}) {
  const convex = useConvex();
  const [open, setOpen] = useState(false);
  const [loadingStorageId, setLoadingStorageId] = useState<Id<'_storage'> | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<Id<'_storage'>, string>>>({});
  const normalizedAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment): attachment is ReceiptAttachment =>
          typeof attachment?.storageId === 'string'
      ),
    [attachments]
  );
  const firstAttachment = normalizedAttachments[0] ?? null;
  const [selectedStorageId, setSelectedStorageId] = useState<Id<'_storage'> | null>(
    firstAttachment?.storageId ?? null
  );

  const selectedAttachment = useMemo(
    () => {
      if (!firstAttachment) {
        return null;
      }

      return (
        normalizedAttachments.find(
          (attachment) => attachment.storageId === selectedStorageId
        ) ?? firstAttachment
      );
    },
    [firstAttachment, normalizedAttachments, selectedStorageId]
  );

  const getReceiptUrl = useCallback(
    async (attachment: ReceiptAttachment) => {
      setLoadingStorageId(attachment.storageId);

      try {
        return await convex.query(api.transactions.getReceiptDownloadUrl, {
          transactionId,
          storageId: attachment.storageId,
        });
      } finally {
        setLoadingStorageId(null);
      }
    },
    [convex, transactionId]
  );

  const downloadReceipt = async (attachment: ReceiptAttachment) => {
    try {
      const url = await getReceiptUrl(attachment);
      if (!url) {
        toast.error('Unable to download receipt.');
        return;
      }

      await downloadFile(url, attachment.fileName);
    } catch (error) {
      toast.error('Unable to download receipt.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  useEffect(() => {
    if (!firstAttachment) {
      setSelectedStorageId(null);
      return;
    }

    setSelectedStorageId((current) => {
      if (
        current &&
        normalizedAttachments.some((attachment) => attachment.storageId === current)
      ) {
        return current;
      }

      return firstAttachment.storageId;
    });
  }, [firstAttachment, normalizedAttachments]);

  useEffect(() => {
    if (!open || !selectedAttachment || previewUrls[selectedAttachment.storageId]) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const url = await getReceiptUrl(selectedAttachment);
        if (!url || cancelled) {
          if (!cancelled && !url) {
            toast.error('Unable to load receipt preview.');
          }
          return;
        }

        setPreviewUrls((current) => ({
          ...current,
          [selectedAttachment.storageId]: url,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        toast.error('Unable to load receipt preview.', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getReceiptUrl, open, previewUrls, selectedAttachment]);

  if (!selectedAttachment) {
    return null;
  }

  const isLoading = loadingStorageId === selectedAttachment.storageId;
  const selectedPreviewUrl = previewUrls[selectedAttachment.storageId];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={loadingStorageId !== null} />}
      >
        {loadingStorageId !== null ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <FileImageIcon className="size-3" />
        )}
        <span className="hidden sm:inline">Receipt</span>
      </DialogTrigger>
      <DialogContent className="w-screen max-w-screen-lg p-0 sm:max-w-screen-lg">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Receipt preview</DialogTitle>
            <DialogDescription>
              View the receipt in-app and download the original image when needed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
            {normalizedAttachments.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {normalizedAttachments.map((attachment, index) => (
                  <Button
                    key={attachment.storageId}
                    type="button"
                    variant={
                      attachment.storageId === selectedAttachment.storageId ? 'default' : 'outline'
                    }
                    size="sm"
                    className="max-w-full"
                    onClick={() => setSelectedStorageId(attachment.storageId)}
                  >
                    <span className="truncate">
                      Receipt {index + 1}
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="rounded-3xl border bg-muted/30 p-3">
              <div className="flex min-h-[50vh] items-center justify-center overflow-hidden rounded-2xl bg-background">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>Loading receipt...</span>
                  </div>
                ) : selectedPreviewUrl ? (
                  <img
                    src={selectedPreviewUrl}
                    alt={selectedAttachment.fileName}
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Preparing receipt preview...
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <p className="truncate font-medium">{selectedAttachment.fileName}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedAttachment.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <DialogFooter showCloseButton className="shrink-0">
              <Button
                type="button"
                onClick={() => void downloadReceipt(selectedAttachment)}
                disabled={loadingStorageId !== null}
              >
                <DownloadIcon className="size-4" />
                Download receipt
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

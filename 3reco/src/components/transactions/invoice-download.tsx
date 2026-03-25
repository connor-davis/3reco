import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { formatTransactionDateForFileName } from '@/lib/transactions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConvex } from 'convex/react';
import { DownloadIcon, FileImageIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';

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
    const isRecent = Date.now() - creationTime < GENERATION_GRACE_MS;
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
  const [loadingStorageId, setLoadingStorageId] = useState<Id<'_storage'> | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  const downloadReceipt = async (attachment: ReceiptAttachment) => {
    setLoadingStorageId(attachment.storageId);

    try {
      const url = await convex.query(api.transactions.getReceiptDownloadUrl, {
        transactionId,
        storageId: attachment.storageId,
      });

      if (!url) {
        return;
      }

      await downloadFile(url, attachment.fileName);
    } finally {
      setLoadingStorageId(null);
    }
  };

  const isLoading = loadingStorageId !== null;
  if (attachments.length === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={() => downloadReceipt(attachments[0])}
      >
        {isLoading ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <FileImageIcon className="size-3" />
        )}
        <span className="hidden sm:inline">Receipt</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={isLoading} />}>
        {isLoading ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <FileImageIcon className="size-3" />
        )}
        <span className="hidden sm:inline">Receipt</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {attachments.map((attachment) => (
          <DropdownMenuItem
            key={attachment.storageId}
            onClick={() => downloadReceipt(attachment)}
          >
            <FileImageIcon className="size-4" />
            <span className="truncate">{attachment.fileName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

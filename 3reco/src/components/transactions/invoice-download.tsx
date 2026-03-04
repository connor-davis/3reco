import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { DownloadIcon, Loader2Icon } from 'lucide-react';

const GENERATION_GRACE_MS = 5 * 60 * 1000; // 5 minutes

async function downloadInvoice(
  url: string,
  transactionId: string,
  creationTime: number
) {
  const invoiceNum = transactionId.slice(-8).toUpperCase();
  const date = new Date(creationTime).toISOString().slice(0, 10);
  const fileName = `3rEco-Invoice-${invoiceNum}-${date}.pdf`;

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

export function InvoiceDownloadButton({
  transactionId,
  creationTime,
}: {
  transactionId: Id<'transactions'>;
  creationTime: number;
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
      onClick={() => downloadInvoice(url, transactionId, creationTime)}
    >
      <DownloadIcon className="size-3" />
      <span className="hidden sm:inline">Invoice</span>
    </Button>
  );
}

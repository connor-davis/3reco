import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/icon-button';
import { Separator } from '@/components/ui/separator';
import { materialById } from '@/lib/data/materials';
import { stores } from '@/lib/data/stores';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  lineCents,
} from '@/lib/format';
import { useMock } from '@/lib/mock/hooks';
import type { Transaction } from '@/lib/types';

type Props = {
  record: Transaction | null;
  onClose: () => void;
};

/** Receipt preview with previous and next, drawn from the record itself. */
export function ReceiptDialog({ record, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const count = record?.receipts ?? 0;

  return (
    <ResponsiveOverlay
      open={record !== null}
      onOpenChange={(open) => !open && onClose()}
      wide
      title={`Receipt ${index + 1} of ${count}`}
      description={record?.id ?? 'Receipt'}
      footer={
        <Button
          variant="outline"
          onClick={() => toast('Receipt download is coming soon.')}
        >
          <Download data-icon="inline-start" />
          Download
        </Button>
      }
    >
      {record && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl border bg-muted/40 p-6 text-sm">
            <p className="font-medium">
              {record.seller} → {record.buyer}
            </p>
            <p>
              {materialById(record.materialId).name} · {formatKg(record.kg)}
            </p>
            <p className="font-semibold tabular-nums">
              {formatRand(lineCents(record.pricePerKg, record.kg))}
            </p>
          </div>
          <div className="flex justify-between">
            <IconButton
              label="Previous receipt"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              label="Next receipt"
              disabled={index >= count - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      )}
    </ResponsiveOverlay>
  );
}

/** Invoice summary with a download button. */
export function InvoiceDialog({ record, onClose }: Props) {
  return (
    <ResponsiveOverlay
      open={record !== null}
      onOpenChange={(open) => !open && onClose()}
      title={record?.invoiceNo ?? 'Invoice'}
      description="A tax invoice for this trade."
      footer={
        <Button onClick={() => toast('Invoice download is coming soon.')}>
          <Download data-icon="inline-start" />
          Download invoice
        </Button>
      }
    >
      {record && (
        <dl className="space-y-2 text-sm">
          <Line label="Seller" value={record.seller} />
          <Line label="Buyer" value={record.buyer} />
          <Line label="Date" value={formatDate(record.date)} />
          <Line label="Material" value={materialById(record.materialId).name} />
          <Line label="Quantity" value={formatKg(record.kg)} />
          <Line label="Rate" value={formatRate(record.pricePerKg)} />
          <Separator />
          <Line
            label="Total"
            value={formatRand(lineCents(record.pricePerKg, record.kg))}
          />
        </dl>
      )}
    </ResponsiveOverlay>
  );
}

/** Who is on a record: a collector or a store, with contact details. */
export function PartyDialog({ record, onClose }: Props) {
  const { data } = useMock();
  const names = record ? [record.seller, record.buyer] : [];

  const parties = names.map((name) => {
    const collector = data.collectors.find((item) => item.name === name);
    const store = stores.find((item) => item.name === name);

    return {
      name,
      phone: collector?.phone ?? store?.phone ?? 'Not shared',
      address: collector
        ? `${collector.street}, ${collector.city}, ${collector.province}`
        : store
          ? `${store.suburb}, ${store.city}, ${store.province}`
          : 'Not shared',
      email: collector?.email ?? 'Shared in chat',
    };
  });

  return (
    <ResponsiveOverlay
      open={record !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Party details"
      description="Verified trade profile"
    >
      <div className="space-y-4">
        {parties.map((party, index) => (
          <div key={party.name}>
            {index > 0 && <Separator className="mb-4" />}
            <div className="mb-2 flex items-center gap-3">
              <PersonAvatar name={party.name} />
              <p className="font-medium">{party.name}</p>
            </div>
            <dl className="space-y-1 text-sm">
              <Line label="Phone" value={party.phone} />
              <Line label="Address" value={party.address} />
              <Line label="Email" value={party.email} />
            </dl>
          </div>
        ))}
      </div>
    </ResponsiveOverlay>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

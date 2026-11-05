import { Leaf } from 'lucide-react';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { formatMass } from '@/lib/format';
import { equivalents, formatCo2 } from '@/lib/impact';
import { useMock } from '@/lib/mock/hooks';
import { cn } from '@/lib/utils';

/**
 * The thank-you after a deal or collection (design 09). The numbers are set
 * once when the deal closes. Nothing here ticks or polls.
 */
export function ImpactDialog() {
  const { celebrate, setCelebrate } = useMock();
  const saved = celebrate ? equivalents(celebrate.co2) : null;

  return (
    <ResponsiveOverlay
      open={celebrate !== null}
      onOpenChange={(open) => !open && setCelebrate(null)}
      title="Nice work. That counts."
      description="Every kilo traded is a kilo kept out of landfill."
      footer={<Button onClick={() => setCelebrate(null)}>Done</Button>}
    >
      {celebrate && saved && (
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              'bg-accent text-accent-foreground'
            )}
          >
            <Leaf aria-hidden="true" />
          </span>
          <p className="text-sm">
            You diverted <strong>{formatMass(celebrate.kg)}</strong> of material
            and saved <strong>{formatCo2(celebrate.co2)}</strong>. That is about{' '}
            {saved.trees} trees growing for a year, or {saved.kmDriven} km not
            driven.
          </p>
        </div>
      )}
    </ResponsiveOverlay>
  );
}

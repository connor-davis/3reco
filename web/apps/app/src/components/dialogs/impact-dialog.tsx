import { Leaf } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useStats } from '@/lib/api/stats';
import { formatKg } from '@/lib/format';

type Props = { open?: boolean; onOpenChange?: (open: boolean) => void };

export function ImpactDialog({
  open = false,
  onOpenChange = () => {},
}: Props = {}) {
  return open ? <ImpactBody onOpenChange={onOpenChange} /> : null;
}

function ImpactBody({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const query = useStats();
  const stats = query.data;
  return (
    <ResponsiveOverlay
      open
      onOpenChange={onOpenChange}
      title="Every trade counts."
      description="The combined impact of settled trades on 3REco."
      footer={
        <Button className="min-h-11" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <DataState
        query={query}
        isEmpty={stats?.deals === 0}
        icon={Leaf}
        emptyTitle="Our impact starts here"
        emptyText="Impact will appear after the first settled trade."
      >
        {stats && (
          <p className="text-sm">
            Together, the community has traded{' '}
            <strong>{formatKg(stats.total_kg)}</strong> of materials in{' '}
            <strong>{stats.deals} trades</strong>, saving an estimated{' '}
            <strong>{formatKg(stats.co2_kg)} CO₂e</strong>.
          </p>
        )}
      </DataState>
    </ResponsiveOverlay>
  );
}

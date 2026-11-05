import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { impactMonths } from '@/lib/data/ledger';
import { useMock } from '@/lib/mock/hooks';

const config = {
  kg: { label: 'Materials traded (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Six weeks of kg on the move, drawn with the shadcn Chart. */
export function ImpactChart() {
  const { pageState } = useMock();

  if (pageState === 'loading') return <Skeleton className="h-56 w-full" />;

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart accessibilityLayer data={impactMonths}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="kg" fill="var(--color-kg)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { Dashboard } from '@/lib/api/types';

const config = {
  kg: { label: 'Materials traded (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function ImpactChart({ series }: { series: Dashboard['series'] }) {
  // Chart geometry uses numbers; amounts shown as money never do.
  const points = series.map((day) => ({
    day: day.day,
    kg: Number(day.weight),
  }));
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart accessibilityLayer data={points}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="kg" fill="var(--color-kg)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

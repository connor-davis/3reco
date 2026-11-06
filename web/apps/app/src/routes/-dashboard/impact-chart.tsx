import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { Dashboard } from '@/lib/api/types';
import { formatDate } from '@/lib/format';

const config = {
  kg: { label: 'Materials traded (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** "12 Oct" for the axis; the tooltip and the rest of the app say "12 Oct 2026". */
export const axisDay = (day: string) => formatDate(day).replace(/ \d{4}$/, '');

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
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickFormatter={axisDay}
          minTickGap={32}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
            />
          }
        />
        <Bar dataKey="kg" fill="var(--color-kg)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

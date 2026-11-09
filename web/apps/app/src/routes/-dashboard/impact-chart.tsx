import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { Dashboard } from '@/lib/api/types';
import { formatDate, formatKg } from '@/lib/format';

const config = {
  kg: { label: 'Materials traded (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** "12 Oct" for the axis; the tooltip and the rest of the app say "12 Oct 2026". */
export const axisDay = (day: string) => formatDate(day).replace(/ \d{4}$/, '');

/** Short axis labels leave room for the plot; tooltips keep the full weight. */
export const axisWeight = (value: number) =>
  `${new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} kg`;

/** Every 7th day from the first, the first and the last day always, and no
 * tick within 4 days of the last so two labels never collide. Computed from
 * the data so the same data gives the same ticks on every load. */
export function axisTicks(days: string[]): string[] {
  const last = days.length - 1;
  return days.filter(
    (_, i) => i === 0 || i === last || (i % 7 === 0 && last - i >= 4)
  );
}

export function ImpactChart({ series }: { series: Dashboard['series'] }) {
  // Chart geometry uses numbers; amounts shown as money never do.
  const points = series.map((day) => ({
    day: day.day,
    kg: Number(day.weight),
  }));
  return (
    <ChartContainer
      config={config}
      className="aspect-auto min-h-56 w-full flex-1"
    >
      <BarChart
        accessibilityLayer
        data={points}
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickFormatter={axisDay}
          minTickGap={32}
          tickMargin={8}
          tick={{ fill: 'var(--muted-foreground)' }}
          padding={{ left: 24, right: 24 }}
          ticks={axisTicks(points.map((p) => p.day))}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={80}
          tick={{ fill: 'var(--muted-foreground)' }}
          tickFormatter={axisWeight}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatKg(String(value))}
                </span>
              )}
            />
          }
        />
        <Bar dataKey="kg" fill="var(--color-kg)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

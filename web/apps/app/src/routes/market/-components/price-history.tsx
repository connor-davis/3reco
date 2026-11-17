import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import {
  useCanSeePrices,
  usePriceHistory,
  type PriceWeek,
} from '@/lib/api/price-history';
import { formatDate } from '@/lib/format';

const config = {
  price: { label: 'R / kg', color: 'var(--primary)' },
} satisfies ChartConfig;

/** Retain the exact price for display; only chart geometry uses numbers. */
export function pricePoints(weeks: PriceWeek[]) {
  return weeks.map((week) => ({
    ...week,
    price: week.avg_price === null ? null : Number(week.avg_price),
  }));
}

/**
 * The latest week that has a price. The current week often has too few deals,
 * so this walks back to the last one that does.
 */
export function latestPrice(points: ReturnType<typeof pricePoints>) {
  return [...points].reverse().find((point) => point.avg_price !== null);
}

/**
 * One quiet line under the filters: the latest average price, opening the
 * chart. It shows nothing at all unless there is a price to show.
 */
export function PriceHistory({ materialId }: { materialId?: string }) {
  const allowed = useCanSeePrices();
  if (!allowed || !materialId) return null;

  return <PriceTrendLine key={materialId} materialId={materialId} />;
}

function PriceTrendLine({ materialId }: { materialId: string }) {
  const query = usePriceHistory(materialId);
  const [open, setOpen] = useState(false);
  // Loading, failed or empty: say nothing rather than show an empty card.
  if (query.isPending || query.isError) return null;
  const points = pricePoints(query.data?.weeks ?? []);
  const latest = latestPrice(points);
  if (!latest) return null;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Avg R {latest.avg_price}/kg, week of{' '}
        {formatDate(latest.period).replace(/ \d{4}$/, '')} ·{' '}
        <Button
          variant="link"
          className="h-auto p-0 text-sm"
          onClick={() => setOpen(true)}
        >
          See trend
        </Button>
      </p>
      <ResponsiveOverlay
        open={open}
        onOpenChange={setOpen}
        title="Price trend"
        description="Weekly average R / kg · Last 12 weeks · Weeks start Monday (UTC)."
      >
        <PriceChart points={points} />
      </ResponsiveOverlay>
    </>
  );
}

function PriceChart({ points }: { points: ReturnType<typeof pricePoints> }) {
  return (
    <>
      <ChartContainer config={config} className="h-48 w-full min-w-0">
        <LineChart
          accessibilityLayer
          data={points}
          margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tickFormatter={(day: string) =>
              formatDate(day).replace(/ \d{4}$/, '')
            }
            minTickGap={40}
            tickMargin={8}
            padding={{ left: 16, right: 16 }}
          />
          <YAxis tickLine={false} axisLine={false} width={56} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) =>
                  `Week of ${formatDate(String(label))}`
                }
                formatter={(_value, _name, item) => (
                  <span className="font-medium tabular-nums">
                    R {item.payload.avg_price} / kg
                  </span>
                )}
              />
            }
          />
          <Line
            type="linear"
            dataKey="price"
            stroke="var(--color-price)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        A price needs at least 5 completed business deals from 3 selling stores.
        Gaps mean not enough deals.
      </p>
      <ul className="sr-only" aria-label="Weekly prices">
        {points.map((point) => (
          <li key={point.period}>
            Week of {formatDate(point.period)}:{' '}
            {point.avg_price === null
              ? 'Not enough deals'
              : `R ${point.avg_price} / kg`}
          </li>
        ))}
      </ul>
    </>
  );
}

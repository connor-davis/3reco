import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

/** The filter selects one material; everyone else sees the usual listings. */
export function PriceHistory({ materialId }: { materialId?: string }) {
  const allowed = useCanSeePrices();
  if (!allowed || !materialId) return null;

  return <PriceHistoryCard key={materialId} materialId={materialId} />;
}

function PriceHistoryCard({ materialId }: { materialId: string }) {
  const query = usePriceHistory(materialId);
  const points = pricePoints(query.data?.weeks ?? []);
  const available = points.some((point) => point.avg_price !== null);

  return (
    <Card size="sm" className="mb-6 min-w-0 max-w-full">
      <CardHeader>
        <CardTitle>
          <h2>Price trend</h2>
        </CardTitle>
        <CardDescription>
          Weekly average R / kg · Last 12 weeks · Weeks start Monday (UTC).
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {query.isPending ? (
          <Skeleton className="h-48 w-full" aria-label="Loading price trend" />
        ) : query.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p>Price trends could not be loaded.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : !available ? (
          <p className="text-muted-foreground">
            Not enough deals yet to show a price.
          </p>
        ) : (
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
              A price needs at least 5 completed business deals from 3 selling
              stores. Gaps mean not enough deals.
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
        )}
      </CardContent>
    </Card>
  );
}

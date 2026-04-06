import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { CreditCardIcon, LeafIcon, TrendingUpIcon, WeightIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { getEffectiveTransactionDate } from '@/lib/transactions';
import { Skeleton } from '@/components/ui/skeleton';

const lineChartConfig = {
  volume: { label: 'Volume (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

interface CollectorDashboardProps {
  dateRange?: DateRange;
}

export default function CollectorDashboard({ dateRange }: CollectorDashboardProps) {
  const stats = useQuery(api.dashboard.collectorStats, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  if (stats === undefined) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-background">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { totals, latestTransactions, dailyTransactions, carbonSavings } = stats;

  const formatDate = (d: string) => format(new Date(d + 'T00:00:00'), 'dd MMM');

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Card className="bg-background">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <CreditCardIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">R {totals.totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">All sales</p>
          </CardContent>
        </Card>

        <Card className="bg-background">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Volume Sold</CardTitle>
            <WeightIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.totalVolume.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">Sold</p>
          </CardContent>
        </Card>

        <Card className="bg-background">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Carbon Savings</CardTitle>
            <LeafIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{carbonSavings.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">CO₂e avoided</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily volume line chart */}
      <Card className="bg-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Daily Sales Volume (30 days)
            </CardTitle>
            <CardDescription>Volume by day</CardDescription>
          </CardHeader>
        <CardContent>
          <ChartContainer config={lineChartConfig} className="h-48 w-full sm:h-56">
            <LineChart data={dailyTransactions}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                interval={6}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(v) => formatDate(v as string)} />}
              />
              <Line
                type="monotone"
                dataKey="volume"
                stroke="var(--color-volume)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Latest transactions */}
      <Card className="bg-background">
          <CardHeader>
            <CardTitle>Latest Sales</CardTitle>
            <CardDescription>Your most recent sales</CardDescription>
          </CardHeader>
        <CardContent>
          {latestTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {latestTransactions.map((t) => (
                  <div
                    key={t._id}
                    className="rounded-2xl border border-border/70 bg-background px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t.materialName}</p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(getEffectiveTransactionDate(t)), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t.buyerName}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Weight</p>
                        <p>{t.weight.toFixed(1)} kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p>R {t.price.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 px-3 text-left font-medium">Material</th>
                    <th className="py-3 px-3 text-right font-medium">Weight</th>
                    <th className="py-3 px-3 text-right font-medium">Price</th>
                    <th className="py-3 px-3 text-left font-medium">Buyer</th>
                    <th className="py-3 px-3 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransactions.map((t) => (
                    <tr key={t._id} className="border-b last:border-0">
                      <td className="py-2 px-3">{t.materialName}</td>
                      <td className="py-2 px-3 text-right">{t.weight.toFixed(1)} kg</td>
                      <td className="py-2 px-3 text-right">R {t.price.toFixed(2)}</td>
                      <td className="py-2 px-3">{t.buyerName}</td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {format(new Date(getEffectiveTransactionDate(t)), 'dd/MM/yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

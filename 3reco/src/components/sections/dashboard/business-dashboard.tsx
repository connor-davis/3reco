import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { BadgeCheckIcon, CreditCardIcon, LeafIcon, PackageIcon, TrendingUpIcon, WeightIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const lineChartConfig = {
  volume: { label: 'Volume (kg)', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export default function BusinessDashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const stats = useQuery(api.dashboard.businessStats, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  if (stats === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
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

  const { totals, latestTransactions, dailyTransactions, carbonSavings, stockSummary } = stats;

  const formatDate = (d: string) => format(new Date(d + 'T00:00:00'), 'dd MMM');

  return (
    <div className="flex flex-col gap-6">
      {/* Date range filter */}
      <div className="flex items-center justify-between">
        <Label className="text-lg">Dashboard</Label>
        <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="All time" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <CreditCardIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">R {totals.totalSpend.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Across all purchases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <WeightIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.totalVolume.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">Materials transacted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUpIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.transactionCount}</p>
            <p className="text-xs text-muted-foreground">Total count</p>
          </CardContent>
        </Card>

        <Card>
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

      {/* Charts + stock row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily volume line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Daily Volume (30 days)
            </CardTitle>
            <CardDescription>Material weight transacted per day (kg)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-56 w-full">
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

        {/* Stock summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageIcon className="size-4" />
              Stock On Hand
            </CardTitle>
            <CardDescription>Current material inventory</CardDescription>
          </CardHeader>
          <CardContent>
            {stockSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock items yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {stockSummary.map((s) => (
                  <div
                    key={s._id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <PackageIcon className="size-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{s.materialName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {s.weight.toFixed(1)} kg
                      </span>
                      <Badge
                        variant={s.isListed ? 'default' : 'secondary'}
                        className="flex items-center gap-1"
                      >
                        {s.isListed && <BadgeCheckIcon className="size-3" />}
                        {s.isListed ? 'Listed' : 'Unlisted'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Latest transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Transactions</CardTitle>
          <CardDescription>Your 5 most recent transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {latestTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 px-3 text-left font-medium">Direction</th>
                    <th className="py-3 px-3 text-left font-medium">Material</th>
                    <th className="py-3 px-3 text-right font-medium">Weight</th>
                    <th className="py-3 px-3 text-right font-medium">Price</th>
                    <th className="py-3 px-3 text-left font-medium">Counterparty</th>
                    <th className="py-3 px-3 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransactions.map((t) => (
                    <tr key={t._id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <Badge variant={t.direction === 'buy' ? 'default' : 'secondary'}>
                          {t.direction === 'buy' ? 'Buy' : 'Sell'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">{t.materialName}</td>
                      <td className="py-2 px-3 text-right">{t.weight.toFixed(1)} kg</td>
                      <td className="py-2 px-3 text-right">R {t.price?.toFixed(2) ?? '—'}</td>
                      <td className="py-2 px-3">{t.counterpartyName}</td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {format(new Date(t._creationTime), 'dd MMM yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { ArrowRightLeftIcon, PackageIcon, TrendingUpIcon, WeightIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEffectiveTransactionDate } from '@/lib/transactions';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

const lineChartConfig = {
  c2bCount: { label: 'C2B', color: 'var(--chart-1)' },
  b2bCount: { label: 'B2B', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const barChartConfig = {
  totalWeight: { label: 'Volume (kg)', color: 'var(--chart-3)' },
} satisfies ChartConfig;

interface AdminDashboardProps {
  dateRange?: DateRange;
}

export default function AdminDashboard({ dateRange }: AdminDashboardProps) {
  const stats = useQuery(api.dashboard.adminStats, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  if (stats === undefined) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
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

  const { totals, latestTransactions, dailyTransactions, materialVolume } = stats;

  // Format x-axis label to show only day/month
  const formatDate = (d: string) => format(new Date(d + 'T00:00:00'), 'dd MMM');

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">C2B Transactions</CardTitle>
            <ArrowRightLeftIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.c2bCount}</p>
            <p className="text-xs text-muted-foreground">Collector to business</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">B2B Transactions</CardTitle>
            <ArrowRightLeftIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.b2bCount}</p>
            <p className="text-xs text-muted-foreground">Business to business</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">C2B Volume</CardTitle>
            <WeightIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.c2bVolume.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">Total materials collected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">B2B Volume</CardTitle>
            <WeightIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.b2bVolume.toFixed(1)} kg</p>
            <p className="text-xs text-muted-foreground">Total materials traded</p>
          </CardContent>
        </Card>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        {/* Daily transactions line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Daily Transactions (30 days)
            </CardTitle>
            <CardDescription>C2B vs B2B transaction counts per day</CardDescription>
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
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(v) => formatDate(v as string)} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="c2bCount"
                  stroke="var(--color-c2bCount)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="b2bCount"
                  stroke="var(--color-b2bCount)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Material volume bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageIcon className="size-4" />
              Stock by Material
            </CardTitle>
            <CardDescription>Current volume held in the system per material (kg)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig} className="h-48 w-full sm:h-56">
              <BarChart data={materialVolume} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="materialName"
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="totalWeight"
                  fill="var(--color-totalWeight)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Transactions</CardTitle>
          <CardDescription>The 5 most recent transactions on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {latestTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {latestTransactions.map((t) => (
                  <div key={t._id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant={t.type === 'c2b' ? 'default' : 'secondary'}>
                        {t.type.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(getEffectiveTransactionDate(t)), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-medium">{t.materialName}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.sellerName} to {t.buyerName}
                      </p>
                    </div>
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
                    <th className="py-3 px-3 text-left font-medium">Type</th>
                    <th className="py-3 px-3 text-left font-medium">Material</th>
                    <th className="py-3 px-3 text-right font-medium">Weight</th>
                    <th className="py-3 px-3 text-right font-medium">Price</th>
                    <th className="py-3 px-3 text-left font-medium">Seller</th>
                    <th className="py-3 px-3 text-left font-medium">Buyer</th>
                    <th className="py-3 px-3 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransactions.map((t) => (
                    <tr key={t._id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <Badge variant={t.type === 'c2b' ? 'default' : 'secondary'}>
                          {t.type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">{t.materialName}</td>
                      <td className="py-2 px-3 text-right">{t.weight.toFixed(1)} kg</td>
                      <td className="py-2 px-3 text-right">R {t.price.toFixed(2)}</td>
                      <td className="py-2 px-3">{t.sellerName}</td>
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

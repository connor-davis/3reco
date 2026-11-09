import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Leaf } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { ImpactDialog } from '@/components/dialogs/impact-dialog';
import { LinkButton } from '@/components/link-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStats } from '@/lib/api/stats';
import { formatKg } from '@/lib/format';
import { formatCo2 } from '@/lib/impact';
import { isStaffRole } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';

export const Route = createFileRoute('/about')({ component: AboutPage });

function AboutPage() {
  const query = useStats();
  const stats = query.data;
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          There's value in what comes next.
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          3REco connects the people who collect recyclable materials with the
          businesses that need them.
        </p>
        <p className="max-w-prose text-muted-foreground">
          Chat, agree a price, arrange collection and invoice each other, all in
          one place.
        </p>
        <DataState
          query={query}
          isEmpty={stats?.deals === 0}
          icon={Leaf}
          emptyTitle="Every trade counts"
          emptyText="Our community impact starts with the first settled trade."
        >
          {stats && (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Leaf
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {formatKg(stats.total_kg)} diverted · {formatCo2(stats.co2_kg)}
            </p>
          )}
        </DataState>
        <div className="flex flex-wrap gap-3">
          <LinkButton className="min-h-11" to="/market" size="lg">
            Browse materials
          </LinkButton>
          {!isStaffRole(user?.role) && (
            <LinkButton
              className="min-h-11"
              to="/sign-up"
              size="lg"
              variant="outline"
            >
              Join the community
            </LinkButton>
          )}
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            Our impact
          </Button>
        </div>
      </div>
      <div className="space-y-4 rounded-3xl bg-muted p-6 sm:p-10">
        <Card>
          <CardHeader>
            <CardTitle>A collection that counts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              List recyclable materials, find a buyer and keep the conversation
              and trade records together.
            </p>
            <p>
              Collectors sell to businesses. Businesses connect with each other
              to give materials their next use.
            </p>
          </CardContent>
        </Card>
      </div>
      <ImpactDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

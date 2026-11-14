import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { AvatarDialog } from '@/components/dialogs/avatar-dialog';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canViewBusiness } from '@/lib/access';
import { useBusiness, useDownloadBusinessData } from '@/lib/api/business';
import { useAuth } from '@/lib/auth/use-auth';
import { initials } from '@/lib/format';
import {
  BusinessForm,
  LocationForm,
  PayoutForm,
} from './profile/-components/forms';

export const Route = createFileRoute('/business')({ component: BusinessRoute });

function BusinessRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <RowsSkeleton rows={4} />;
  if (!canViewBusiness(user))
    return (
      <PageHeader
        title="Business"
        description="Only an Owner or Manager can open this page. Ask your Owner for help."
      />
    );
  return <BusinessPage key={user?.active_business_id} />;
}

function BusinessPage() {
  const query = useBusiness();
  const business = query.data;
  const [logoOpen, setLogoOpen] = useState(false);
  const download = useDownloadBusinessData();
  const readOnly = !business?.can_edit;
  const name = business?.business_name ?? '';

  return (
    <>
      <PageHeader
        title="Business"
        description={
          readOnly
            ? 'Your business details. Only an Owner can change them.'
            : 'Keep your business details up to date.'
        }
      />
      <DataState
        query={query}
        isEmpty={!business}
        icon={Building2}
        emptyTitle="No business yet"
        emptyText="Finish your setup to add your business."
        skeleton={<RowsSkeleton rows={4} />}
      >
        {business && (
          <Tabs defaultValue="business" className="gap-6">
            <TabsList>
              <TabsTrigger value="business">Business</TabsTrigger>
              <TabsTrigger value="bank">Bank & payout</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              {!readOnly && (
                <TabsTrigger value="data">Business data</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="business">
              <Panel
                title="Business details"
                description="Shown to people you trade with."
              >
                <div className="mb-6 flex items-center gap-4">
                  <Avatar className="size-16">
                    <AvatarImage
                      src={
                        business.avatar_url
                          ? business.avatar_url + '?v=' + query.dataUpdatedAt
                          : undefined
                      }
                      alt={name}
                    />
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  {!readOnly && (
                    <Button
                      className="min-h-11 shrink-0"
                      variant="outline"
                      onClick={() => setLogoOpen(true)}
                    >
                      Store logo
                    </Button>
                  )}
                </div>
                <BusinessForm profile={business} readOnly={readOnly} />
              </Panel>
            </TabsContent>
            <TabsContent value="bank">
              <Panel title="Bank & payout" description="Where payments go.">
                <PayoutForm profile={business} business readOnly={readOnly} />
              </Panel>
            </TabsContent>
            <TabsContent value="location">
              <Panel title="Location" description="Your address and area.">
                <LocationForm profile={business} business readOnly={readOnly} />
              </Panel>
            </TabsContent>
            {!readOnly && (
              <TabsContent value="data">
                <Panel
                  title="Business data"
                  description="Everything this business holds on 3REco."
                >
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Download your business details (with the bank account),
                      team, stock, requests, transactions and the collectors you
                      added, as one file. Deleting a business is not available
                      yet.
                    </p>
                    <Button
                      className="min-h-11"
                      disabled={download.isPending}
                      onClick={() => download.mutate()}
                    >
                      {download.isPending
                        ? 'Preparing download…'
                        : 'Download business data'}
                    </Button>
                    {download.isError && (
                      <p role="alert" className="text-sm text-destructive">
                        {download.error.message} Try again.
                      </p>
                    )}
                  </div>
                </Panel>
              </TabsContent>
            )}
          </Tabs>
        )}
      </DataState>
      <AvatarDialog
        open={logoOpen}
        onOpenChange={setLogoOpen}
        name={name}
        business
      />
    </>
  );
}

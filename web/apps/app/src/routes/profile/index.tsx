import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { AvatarDialog } from '@/components/dialogs/avatar-dialog';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isStaffRole } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import { useProfile } from '@/lib/api/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { PrivacyPanel } from './-components/privacy-panel';
import {
  BusinessForm,
  LocationForm,
  PayoutForm,
  PersonalForm,
} from './-components/forms';
import { SessionsPanel } from './-components/sessions-panel';

export const Route = createFileRoute('/profile/')({
  component: () => (
    <Guarded page="profile">
      <ProfilePage />
    </Guarded>
  ),
});

function ProfilePage() {
  const { user } = useAuth();
  const role = user?.role;
  // Admin and staff run 3REco; they have no business or bank details to keep.
  const staff = isStaffRole(role);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const query = useProfile();
  const profile = query.data;
  const person = { name: profile?.name ?? user?.name ?? '' };

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Keep your details up to date so trades run smoothly."
        actions={
          user && !user.profileComplete && !isStaffRole(role) ? (
            <LinkButton to="/setup">Finish setup</LinkButton>
          ) : undefined
        }
      />
      <DataState
        query={query}
        isEmpty={!profile}
        icon={UserRound}
        emptyTitle="Your profile is not set up yet"
        emptyText="Add your details so people can trade with you."
        emptyAction={<LinkButton to="/setup">Finish setup</LinkButton>}
        skeleton={<RowsSkeleton rows={4} />}
      >
        <Tabs defaultValue="personal" className="gap-6">
          <TabsList>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            {role !== 'collector' && !staff && (
              <TabsTrigger value="business">Business</TabsTrigger>
            )}
            {!staff && <TabsTrigger value="bank">Bank & payout</TabsTrigger>}
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="privacy">Your data</TabsTrigger>
          </TabsList>
          <TabsContent value="personal">
            <Section
              title="Personal details"
              description="Who you are on 3REco."
            >
              <div className="mb-6 flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarImage
                    src={
                      profile?.avatar_url
                        ? profile.avatar_url + '?v=' + query.dataUpdatedAt
                        : undefined
                    }
                    alt={person.name}
                  />
                  <AvatarFallback>{initials(person.name)}</AvatarFallback>
                </Avatar>
                <Button
                  className="min-h-11 shrink-0"
                  variant="outline"
                  onClick={() => setAvatarOpen(true)}
                >
                  {role === 'business' ? 'Store logo' : 'Change picture'}
                </Button>
              </div>
              {profile && <PersonalForm profile={profile} />}
            </Section>
          </TabsContent>
          {!staff && (
            <>
              <TabsContent value="business">
                <Section
                  title="Business details"
                  description="Shown to people you trade with."
                >
                  {profile && <BusinessForm profile={profile} />}
                </Section>
              </TabsContent>
              <TabsContent value="bank">
                <Section title="Bank & payout" description="Where payments go.">
                  {profile && <PayoutForm profile={profile} />}
                </Section>
              </TabsContent>
            </>
          )}
          <TabsContent value="location">
            <Section title="Location" description="Your address and area.">
              {profile && <LocationForm profile={profile} />}
            </Section>
          </TabsContent>
          <TabsContent value="privacy">
            <Section
              title="Privacy"
              description="Your privacy and account controls."
            >
              <PrivacyPanel />
            </Section>
          </TabsContent>
          <TabsContent value="sessions">
            <Section
              title="Sessions"
              description="Signed-in accounts on this device."
            >
              <SessionsPanel />
            </Section>
          </TabsContent>
        </Tabs>
      </DataState>
      <AvatarDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        name={person.name}
      />
    </>
  );
}

type SectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

function Section({ title, description, children }: SectionProps) {
  return (
    <Panel title={title} description={description}>
      {children}
    </Panel>
  );
}

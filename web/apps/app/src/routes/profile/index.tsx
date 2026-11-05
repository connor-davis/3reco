import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { AvatarDialog } from '@/components/dialogs/avatar-dialog';
import { ProfileWizard } from '@/components/dialogs/profile-wizard';
import { PageHeader } from '@/components/page-header';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMock, usePerson } from '@/lib/mock/hooks';
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
  const { role } = useMock();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const person = usePerson();

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Keep your details up to date so trades run smoothly."
        actions={
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            Preview completion wizard
          </Button>
        }
      />
      <DataState
        icon={UserRound}
        emptyTitle="Your profile is not set up yet"
        emptyText="Add your details so people can trade with you."
        emptyAction={
          <Button onClick={() => setWizardOpen(true)}>
            Finish your profile
          </Button>
        }
        skeleton={<RowsSkeleton rows={4} />}
      >
        <Tabs defaultValue="personal" className="gap-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            {role !== 'collector' && (
              <TabsTrigger value="business">Business</TabsTrigger>
            )}
            <TabsTrigger value="bank">Bank & payout</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>
          <TabsContent value="personal">
            <Section
              title="Personal details"
              description="Who you are on 3REco."
            >
              <div className="mb-6 flex items-center gap-4">
                <PersonAvatar name={person.name} className="size-16" />
                <Button variant="outline" onClick={() => setAvatarOpen(true)}>
                  Change picture
                </Button>
              </div>
              <PersonalForm />
            </Section>
          </TabsContent>
          <TabsContent value="business">
            <Section
              title="Business details"
              description="Shown to people you trade with."
            >
              <BusinessForm />
            </Section>
          </TabsContent>
          <TabsContent value="bank">
            <Section title="Bank & payout" description="Where payments go.">
              <PayoutForm />
            </Section>
          </TabsContent>
          <TabsContent value="location">
            <Section
              title="Location"
              description="Where materials are collected from."
            >
              <LocationForm />
            </Section>
          </TabsContent>
          <TabsContent value="sessions">
            <Section
              title="Sessions"
              description="Where you are signed in right now."
            >
              <SessionsPanel />
            </Section>
          </TabsContent>
        </Tabs>
      </DataState>
      <ProfileWizard open={wizardOpen} onOpenChange={setWizardOpen} />
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

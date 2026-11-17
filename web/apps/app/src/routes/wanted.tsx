import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth/use-auth';
import { WantedBrowse } from './-components/wanted-browse';
import { WantedForm } from './-components/wanted-form';
import { MyWanted } from './-components/wanted-mine';

export const Route = createFileRoute('/wanted')({
  component: () => (
    <Guarded page="wanted">
      <WantedPage />
    </Guarded>
  ),
});

function WantedPage() {
  const { user } = useAuth();
  const [postOpen, setPostOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Wanted"
        description="Tell sellers what you want to buy. They reply with an offer, and you pick one."
      />
      <Tabs defaultValue={user?.business_verified ? 'browse' : 'mine'}>
        <TabsList aria-label="Wanted posts">
          {user?.business_verified && (
            <TabsTrigger value="browse">Buyers want these</TabsTrigger>
          )}
          <TabsTrigger value="mine">My posts</TabsTrigger>
        </TabsList>
        {user?.business_verified && (
          <TabsContent value="browse" keepMounted>
            <WantedBrowse />
          </TabsContent>
        )}
        <TabsContent value="mine" keepMounted>
          <Button className="my-4" onClick={() => setPostOpen(true)}>
            Post what you want
          </Button>
          <MyWanted />
        </TabsContent>
      </Tabs>
      <WantedForm open={postOpen} onOpenChange={setPostOpen} />
    </>
  );
}

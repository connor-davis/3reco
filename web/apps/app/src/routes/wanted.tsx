import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { PageHeader } from '@/components/page-header';
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

  return (
    <>
      <PageHeader
        title="Wanted"
        description="Tell sellers what you want to buy. They reply with an offer, and you pick one."
      />
      <div className="space-y-8">
        {user?.business_verified && <WantedBrowse />}
        <WantedForm />
        <MyWanted />
      </div>
    </>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { RequestList } from './-components/request-list';

export const Route = createFileRoute('/market/incoming')({
  component: () => (
    <Guarded page="incoming">
      <RequestList
        direction="incoming"
        title="Incoming requests"
        description="People interested in your materials. Reply and agree on the details."
        emptyTitle="No incoming requests"
      />
    </Guarded>
  ),
});

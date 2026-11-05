import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { RequestList } from './-components/request-list';

export const Route = createFileRoute('/market/outgoing')({
  component: () => (
    <Guarded page="outgoing">
      <RequestList
        direction="outgoing"
        title="Outgoing requests"
        description="Your conversations with sellers, from first ask to final deal."
        emptyTitle="No outgoing requests"
      />
    </Guarded>
  ),
});

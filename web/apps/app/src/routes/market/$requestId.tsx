import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { MessagesLayout } from '@/components/chat/messages-layout';

// The deal room: the same screen as /messages with one request open.
export const Route = createFileRoute('/market/$requestId')({
  component: RequestPage,
});

function RequestPage() {
  const { requestId } = Route.useParams();

  return (
    <Guarded page="messages">
      <MessagesLayout requestId={requestId} />
    </Guarded>
  );
}

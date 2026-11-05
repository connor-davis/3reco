import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { MessagesLayout } from '@/components/chat/messages-layout';

export const Route = createFileRoute('/messages/$requestId')({
  component: MessagePage,
});

function MessagePage() {
  const { requestId } = Route.useParams();

  return (
    <Guarded page="messages">
      <MessagesLayout requestId={requestId} />
    </Guarded>
  );
}

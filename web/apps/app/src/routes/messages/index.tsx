import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { MessagesLayout } from '@/components/chat/messages-layout';

export const Route = createFileRoute('/messages/')({
  component: () => (
    <Guarded page="messages">
      <MessagesLayout />
    </Guarded>
  ),
});

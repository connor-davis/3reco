import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { NewMessageDialog } from '@/components/dialogs/new-message-dialog';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useIsMobile, useIsWide } from '@/hooks/use-mobile';
import { ApiError } from '@/lib/api/client';
import { useRequest } from '@/lib/api/requests';
import { useAuth } from '@/lib/auth/use-auth';
import { Conversation } from './conversation';
import { DealAside } from './deal-aside';
import { Inbox } from './inbox';

// A chat the caller may not read. Retrying cannot change that, so no retry.
function ChatBlocked({ staff }: { staff: boolean }) {
  return (
    <Empty className="h-full rounded-none bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare />
        </EmptyMedia>
        <EmptyTitle>You can't open this chat</EmptyTitle>
        <EmptyDescription>
          {staff
            ? 'Staff do not take part in trade chats.'
            : 'It may belong to another account.'}
        </EmptyDescription>
      </EmptyHeader>
      <LinkButton to={staff ? '/transactions' : '/messages'}>
        {staff ? 'Go to transactions' : 'Back to messages'}
      </LinkButton>
    </Empty>
  );
}

export function MessagesLayout({ requestId }: { requestId?: string }) {
  const { user } = useAuth();
  const staff = user?.role === 'staff';
  const active = useRequest(requestId ?? '');
  const denied =
    staff ||
    (active.error instanceof ApiError &&
      (active.error.status === 403 || active.error.status === 404));
  const [newOpen, setNewOpen] = useState(false);
  const isMobile = useIsMobile();
  const wide = useIsWide();
  const showAside = !!active.data && wide;
  const inbox = <Inbox activeId={requestId} onNew={() => setNewOpen(true)} />;
  const thread = requestId ? (
    denied ? (
      <ChatBlocked staff={staff} />
    ) : (
      <DataState
        query={active}
        isEmpty={!active.data}
        icon={MessageSquare}
        emptyTitle="Conversation not found"
        emptyText="It may belong to another account."
      >
        {active.data && (
          <Conversation key={active.data.id} request={active.data} />
        )}
      </DataState>
    )
  ) : (
    <Empty className="h-full rounded-none bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare />
        </EmptyMedia>
        <EmptyTitle>
          {staff ? 'No chats to open' : 'Pick a conversation'}
        </EmptyTitle>
        <EmptyDescription>
          {staff
            ? 'Staff look after the platform, not trade chats.'
            : 'Choose a conversation from your inbox to read it.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
  return (
    <>
      {isMobile ? (
        <div className="h-[calc(100dvh-6.75rem)] min-h-[32rem] overflow-hidden">
          {requestId ? (
            thread
          ) : (
            <div className="h-full bg-background">{inbox}</div>
          )}
        </div>
      ) : (
        <div className="h-[calc(100dvh-3.5rem)] min-h-[32rem]">
          <ResizablePanelGroup
            key={showAside ? 'three' : 'two'}
            orientation="horizontal"
          >
            <ResizablePanel
              id="inbox"
              defaultSize={showAside ? '25%' : '30%'}
              minSize={260}
              maxSize="32%"
              className="min-h-0 bg-background"
            >
              {inbox}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="thread"
              defaultSize={showAside ? '48%' : '70%'}
              minSize="40%"
              className="min-h-0"
            >
              {thread}
            </ResizablePanel>
            {showAside && active.data && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id="aside"
                  defaultSize="27%"
                  minSize={240}
                  maxSize="28%"
                  className="min-h-0 bg-background"
                >
                  <aside className="h-full overflow-y-auto p-6">
                    <DealAside request={active.data} />
                  </aside>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      )}
      <NewMessageDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}

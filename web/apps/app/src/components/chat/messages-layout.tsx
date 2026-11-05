import { useState } from 'react';
import { MessageSquare, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { NewMessageDialog } from '@/components/dialogs/new-message-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile, useIsWide } from '@/hooks/use-mobile';
import { useMock } from '@/lib/mock/hooks';
import { Conversation } from './conversation';
import { DealAside } from './deal-aside';
import { Inbox } from './inbox';

/**
 * The messages screen: inbox, conversation and deal aside. On phones only
 * one column shows at a time: the inbox, or the open conversation.
 */
export function MessagesLayout({ requestId }: { requestId?: string }) {
  const { data, pageState, setPageState } = useMock();
  const [newOpen, setNewOpen] = useState(false);
  const active = data.requests.find((request) => request.id === requestId);
  const isMobile = useIsMobile();
  const wide = useIsWide();
  const showAside = Boolean(active) && pageState === 'ready' && wide;

  const inbox = (
    <Inbox
      requests={data.requests}
      activeId={requestId}
      onNew={() => setNewOpen(true)}
    />
  );
  // The Preview page state also applies to an open conversation.
  const thread =
    pageState === 'loading' ? (
      <Skeleton className="h-full w-full rounded-none" />
    ) : pageState === 'error' ? (
      <ThreadError
        onRetry={() => {
          setPageState('ready');
          toast.success('Loaded again.');
        }}
      />
    ) : active && pageState === 'ready' ? (
      <Conversation request={active} />
    ) : (
      <NoThread missing={Boolean(requestId) && pageState === 'ready'} />
    );

  // Phones show one column at a time: the inbox, or the open conversation.
  if (isMobile) {
    return (
      <div className="h-[calc(100dvh-6.75rem)] min-h-[32rem] overflow-hidden">
        {requestId ? thread : <div className="h-full bg-card">{inbox}</div>}
        <NewMessageDialog open={newOpen} onOpenChange={setNewOpen} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-3.5rem)] min-h-[32rem]">
      <ResizablePanelGroup
        key={showAside ? 'three' : 'two'}
        id={showAside ? 'messages-three' : 'messages-two'}
        orientation="horizontal"
      >
        <ResizablePanel
          id="inbox"
          defaultSize={showAside ? '25%' : '30%'}
          minSize={260}
          maxSize="32%"
          className="min-h-0 bg-card"
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
        {showAside && active && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="aside"
              defaultSize="27%"
              minSize={240}
              maxSize="28%"
              className="min-h-0 bg-card"
            >
              <aside className="h-full overflow-y-auto p-6">
                <DealAside request={active} />
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <NewMessageDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function ThreadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="h-full rounded-none bg-chat">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>We couldn't load this conversation</EmptyTitle>
        <EmptyDescription>
          Check your connection and try again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function NoThread({ missing }: { missing: boolean }) {
  return (
    <Empty className="h-full rounded-none bg-chat">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare />
        </EmptyMedia>
        <EmptyTitle>
          {missing ? "We can't find that conversation" : 'Pick a conversation'}
        </EmptyTitle>
        <EmptyDescription>
          {missing
            ? 'It may belong to another account.'
            : 'Choose one on the left, or start a new one.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

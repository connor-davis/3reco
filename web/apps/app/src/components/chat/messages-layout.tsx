import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { NewMessageDialog } from '@/components/dialogs/new-message-dialog';
import { DataState } from '@/components/data-state';
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
import { useRequest } from '@/lib/api/requests';
import { Conversation } from './conversation';
import { DealAside } from './deal-aside';
import { Inbox } from './inbox';

export function MessagesLayout({ requestId }: { requestId?: string }) {
  const active = useRequest(requestId ?? '');
  const [newOpen, setNewOpen] = useState(false);
  const isMobile = useIsMobile();
  const wide = useIsWide();
  const showAside = !!active.data && wide;
  const inbox = <Inbox activeId={requestId} onNew={() => setNewOpen(true)} />;
  const thread = requestId ? (
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
  ) : (
    <Empty className="h-full rounded-none bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare />
        </EmptyMedia>
        <EmptyTitle>Pick a conversation</EmptyTitle>
        <EmptyDescription>
          Choose one on the left, or start a new one.
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

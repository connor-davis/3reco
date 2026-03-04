import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ConvexError } from 'convex/values';
import { format } from 'date-fns';
import { SendIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export default function MessageThread({
  requestId,
}: {
  requestId: Id<'transactionRequests'>;
}) {
  const currentUser = useConvexQuery(api.users.currentUser, {});
  const messages = useConvexQuery(api.transactionRequestMessages.listByRequest, {
    transactionId: requestId,
  });
  const sendMessage = useConvexMutation(api.transactionRequestMessages.send);
  const [content, setContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    toast.promise(
      sendMessage({ transactionId: requestId, content: trimmed }),
      {
        loading: 'Sending...',
        success: () => {
          setContent('');
          return 'Message sent.';
        },
        error: (error: Error) => {
          if (error instanceof ConvexError) {
            return { message: error.data.name, description: error.data.message };
          }
          return { message: error.name, description: error.message };
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">
      <div className="flex flex-col flex-1 overflow-y-auto gap-3 min-h-0 py-2">
        {!messages && (
          <div className="flex flex-col gap-3 p-2">
            <Skeleton className="w-64 h-10" />
            <Skeleton className="w-48 h-10 self-end" />
          </div>
        )}
        {messages && messages.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">
            No messages yet. Start the conversation.
          </p>
        )}
        {messages?.map((msg) => {
          const isOwn = msg.senderId === currentUser?._id;
          return (
            <div
              key={msg._id}
              className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex flex-col gap-1 max-w-[78%] sm:max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-muted-foreground text-xs">
                  {format(new Date(msg._creationTime), 'p')}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          placeholder="Type a message..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleSend} size="icon" disabled={!content.trim()}>
          <SendIcon />
        </Button>
      </div>
    </div>
  );
}

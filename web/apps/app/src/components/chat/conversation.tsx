import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Info, MessageSquare } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { TextField } from '@/components/form-fields';
import { IconButton } from '@/components/icon-button';
import { OfferDialog } from '@/components/dialogs/offer-dialog';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth/use-auth';
import { useMessageHistory, useReadMessages } from '@/lib/api/messages';
import type { TradeRequest } from '@/lib/api/types';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InvoiceCard, OfferCard } from './cards';
import { DealAside } from './deal-aside';
import { DealStepper } from './deal-stepper';
import {
  canMakeOffer,
  canRespond,
  counterpartyOf,
  isClosed,
  orderedMessages,
} from './helpers';
import { useRequestActions } from './use-request-actions';

type Confirm = 'cancel' | 'reject' | 'withdraw';

// "Withdraw" takes back the offer, not the whole request.
const confirmText: Record<Confirm, { title: string; label: string }> = {
  cancel: { title: 'Cancel this request?', label: 'Cancel request' },
  reject: { title: 'Reject this request?', label: 'Reject request' },
  withdraw: { title: 'Withdraw this offer?', label: 'Withdraw offer' },
};
const schema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Enter a message.')
    .max(2000, 'Keep your message within 2 000 characters.'),
});

export function Conversation({ request }: { request: TradeRequest }) {
  const { user } = useAuth();
  const actions = useRequestActions(request);
  const history = useMessageHistory(request.id);
  const read = useReadMessages(request.id);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { content: '' },
  });
  const [offerOpen, setOfferOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const other = counterpartyOf(request, user?.id);
  const seller = request.seller.id === user?.id;
  const participant = seller || request.buyer.id === user?.id;
  const canAct = user?.role === 'business' && participant && !isClosed(request);
  const messages = orderedMessages(
    history.data?.pages.flatMap((page) => page.items) ?? []
  );
  const newest = messages.at(-1)?.id;
  const newestIncoming = messages
    .filter((message) => message.sender_id !== user?.id)
    .at(-1)?.id;
  const bottom = useRef<HTMLDivElement>(null);
  const lastRead = useRef<string | null>(null);
  const { fetchNextPage, hasNextPage, isFetching, isFetchNextPageError } =
    history;

  // Cursors run oldest first. Reach the tail before enabling the composer.
  useEffect(() => {
    if (hasNextPage && !isFetching && !isFetchNextPageError)
      void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchNextPageError]);

  useEffect(() => {
    if (!hasNextPage) bottom.current?.scrollIntoView({ block: 'end' });
  }, [newest, hasNextPage, request.status]);

  const markRead = read.mutate;
  useEffect(() => {
    if (!newestIncoming || hasNextPage || lastRead.current === newestIncoming)
      return;
    lastRead.current = newestIncoming;
    markRead();
  }, [newestIncoming, hasNextPage, markRead]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-chat">
      <header className="flex min-h-20 items-center gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <Link
          to="/messages"
          aria-label="Back to messages"
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted min-[781px]:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <PersonAvatar name={other.name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{other.name}</h2>
          <StatusBadge status={request.status} />
        </div>
        <IconButton label="Request details" onClick={() => setInfoOpen(true)}>
          <Info />
        </IconButton>
      </header>
      <div className="space-y-3 border-b bg-card px-4 py-3 sm:px-6">
        <DealStepper status={request.status} />
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {canMakeOffer(request, user?.id) && (
              <Button
                disabled={actions.isPending}
                onClick={() => setOfferOpen(true)}
              >
                {request.status === 'offered' ? 'Change offer' : 'Make offer'}
              </Button>
            )}
            {seller && request.status === 'offered' && (
              <Button
                variant="outline"
                disabled={actions.isPending}
                onClick={() => setConfirm('withdraw')}
              >
                Withdraw offer
              </Button>
            )}
            <Button
              variant="outline"
              disabled={actions.isPending}
              onClick={() => setConfirm(seller ? 'reject' : 'cancel')}
            >
              {seller ? 'Reject request' : 'Cancel request'}
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-6 sm:px-6">
          <DataState
            query={history}
            isEmpty={!messages.length}
            icon={MessageSquare}
            emptyTitle="Start the conversation"
            emptyText="Ask about the material and agree on the details."
          >
            <div
              role="log"
              aria-live="polite"
              aria-label={`Conversation with ${other.name}`}
              className="space-y-4"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'w-fit max-w-[min(85%,75ch)] rounded-2xl px-4 py-3 text-sm shadow-xs',
                    message.sender_id === user?.id
                      ? 'ml-auto bg-outgoing'
                      : 'bg-card'
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <time
                    dateTime={message.created_at}
                    className="mt-1 block text-right text-xs text-muted-foreground"
                  >
                    {formatTime(message.created_at)}
                  </time>
                </div>
              ))}
            </div>
          </DataState>
          {hasNextPage && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading the latest messages…
            </p>
          )}
          {isFetchNextPageError && (
            <Button variant="outline" onClick={() => void fetchNextPage()}>
              Try loading messages again
            </Button>
          )}
          {request.status === 'offered' && (
            <OfferCard
              request={request}
              canRespond={canAct && canRespond(request, user?.id)}
              onAccept={() => void actions.accept()}
              onDecline={() => void actions.decline()}
              disabled={actions.isPending}
            />
          )}
          {request.status === 'accepted' && (
            <InvoiceCard
              request={request}
              transactionId={actions.transactionId}
            />
          )}
          <div ref={bottom} />
        </div>
      </ScrollArea>
      <footer className="space-y-3 border-t bg-card px-4 py-4 sm:px-6">
        {actions.error && (
          <p role="alert" className="text-sm text-destructive">
            {actions.error}
          </p>
        )}
        {read.error && (
          <p role="alert" className="text-sm text-destructive">
            {read.error.message}{' '}
            <Button variant="outline" size="sm" onClick={() => read.mutate()}>
              Retry read receipt
            </Button>
          </p>
        )}
        {canAct && request.status === 'pending' ? (
          <form
            className="flex items-end gap-3"
            noValidate
            onSubmit={form.handleSubmit(async ({ content }) => {
              if (await actions.send(content)) form.reset();
            })}
          >
            <div className="min-w-0 flex-1">
              <TextField
                control={form.control}
                name="content"
                label={`Message ${other.name}`}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              disabled={
                actions.isPending ||
                history.isPending ||
                history.isError ||
                !!hasNextPage
              }
            >
              Send
            </Button>
          </form>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {isClosed(request)
              ? 'This request is closed.'
              : request.status === 'offered'
                ? 'Respond to or withdraw the offer to continue messaging.'
                : 'Read only'}
          </p>
        )}
      </footer>
      <OfferDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        request={request}
      />
      <ResponsiveOverlay
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title="Request details"
        description={request.id}
      >
        <DealAside request={request} />
      </ResponsiveOverlay>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? confirmText[confirm].title : 'Cancel this request?'}
        description={
          confirm === 'withdraw'
            ? 'The reserved stock will be released and negotiation can continue.'
            : 'The other party will be notified.'
        }
        confirmLabel={confirm ? confirmText[confirm].label : 'Confirm'}
        onConfirm={() => {
          if (confirm)
            void actions[confirm]().then((ok) => {
              if (ok) setConfirm(null);
            });
        }}
      />
    </section>
  );
}

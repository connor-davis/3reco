import { toast } from 'sonner';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Info, LoaderCircle, MessageSquare } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { TextField } from '@/components/form-fields';
import { IconButton } from '@/components/icon-button';
import { OfferDialog } from '@/components/dialogs/offer-dialog';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
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
  requestLabel,
  messageText,
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
  // An admin may read any chat, but never writes or acts in one.
  const viewer = user?.role === 'admin';
  const canAct = user?.role === 'business' && participant && !isClosed(request);
  const messages = orderedMessages(
    history.data?.pages.flatMap((page) => page.items) ?? []
  );
  const newest = messages.at(-1)?.id;
  const scroll = useRef<HTMLDivElement>(null);
  const older = useRef<HTMLDivElement>(null);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const lastNewest = useRef<string | undefined>(undefined);
  const atBottom = useRef(true);
  const lastRead = useRef<string | null>(null);
  const {
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    isFetchingNextPage,
  } = history;

  const loadOlder = useCallback(() => {
    const viewport = scroll.current;
    if (!viewport || !hasNextPage || isFetching) return;
    prepend.current = {
      height: viewport.scrollHeight,
      top: viewport.scrollTop,
    };
    void fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) prepend.current = null;
    });
  }, [fetchNextPage, hasNextPage, isFetching]);

  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport || !newest) return;
    if (prepend.current) {
      viewport.scrollTop =
        prepend.current.top + viewport.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (
      !lastNewest.current ||
      (newest !== lastNewest.current && atBottom.current)
    ) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    lastNewest.current = newest;
  }, [newest, messages.length]);

  useEffect(() => {
    const viewport = scroll.current;
    if (
      !viewport ||
      !older.current ||
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          viewport.scrollHeight > viewport.clientHeight
        )
          loadOlder();
      },
      { root: viewport, rootMargin: '100px 0px 0px 0px' }
    );
    observer.observe(older.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isFetchNextPageError, loadOlder]);

  const markRead = read.mutate;
  useEffect(() => {
    // Opening the recent page marks the request read, even if every recent
    // line was ours. Loading older pages must not send another receipt.
    if (viewer || !newest || lastRead.current === newest) return;
    lastRead.current = newest;
    markRead();
  }, [viewer, newest, markRead]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-20 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Link
          to="/messages"
          aria-label="Back to messages"
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted min-[781px]:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <PersonAvatar name={other.name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {viewer
              ? `${request.buyer.name} and ${request.seller.name}`
              : other.name}
          </h2>
          <StatusBadge status={requestLabel(request, user?.id)} />
        </div>
        <IconButton label="Request details" onClick={() => setInfoOpen(true)}>
          <Info />
        </IconButton>
      </header>
      <div className="space-y-3 border-b bg-background px-4 py-3 sm:px-6">
        <DealStepper request={request} />
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {canMakeOffer(request, user?.id) && (
              <Button
                disabled={actions.isPending}
                onClick={() => setOfferOpen(true)}
              >
                {request.status === 'offered' ? 'Counter offer' : 'Make offer'}
              </Button>
            )}
            {request.offer_by === user?.id && request.status === 'offered' && (
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
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
        onScroll={() => {
          const viewport = scroll.current;
          if (viewport)
            atBottom.current =
              viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <
              100;
        }}
      >
        <div className="space-y-4 px-4 py-6 sm:px-6">
          <div ref={older}>
            {hasNextPage && (
              <Button
                variant="outline"
                disabled={isFetching}
                onClick={loadOlder}
              >
                Load older messages
              </Button>
            )}
            {isFetchingNextPage && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <LoaderCircle className="size-4 animate-spin" /> Loading older
                messages…
              </p>
            )}
            {isFetchNextPageError && (
              <p role="alert">Could not load older messages. Try again.</p>
            )}
            {history.isSuccess && !hasNextPage && messages.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Beginning of conversation
              </p>
            )}
          </div>
          <DataState
            query={{ ...history, isError: history.isLoadingError }}
            isEmpty={
              !messages.length &&
              request.status !== 'offered' &&
              request.status !== 'accepted'
            }
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
              {messages.map((message) =>
                message.system ? (
                  <p
                    key={message.id}
                    aria-label="System event"
                    className="py-2 text-center text-sm text-muted-foreground"
                  >
                    <span className="font-medium">System · </span>
                    {messageText(message.content)}
                  </p>
                ) : (
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
                      {messageText(message.content)}
                    </p>
                    <time
                      dateTime={message.created_at}
                      className="mt-1 block text-right text-xs text-muted-foreground"
                    >
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                )
              )}
            </div>
          </DataState>
          {request.status === 'offered' && (
            <OfferCard
              request={request}
              canRespond={canAct && canRespond(request, user?.id)}
              onAccept={() =>
                void actions.accept().then((ok) => {
                  if (ok) toast.success('Confirmation saved.');
                })
              }
              onDecline={() => setConfirm('reject')}
              disabled={actions.isPending}
            />
          )}
          {request.status === 'accepted' && (
            <InvoiceCard
              request={request}
              transactionId={actions.transactionId}
            />
          )}
        </div>
      </div>
      <footer className="space-y-3 border-t bg-background px-4 py-4 sm:px-6">
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
        {canAct ? (
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
                actions.isPending || history.isPending || history.isLoadingError
              }
            >
              Send
            </Button>
          </form>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {viewer
              ? 'You are viewing this chat as an admin.'
              : isClosed(request)
                ? 'This request is closed.'
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
              if (ok) {
                toast.success(
                  confirm === 'cancel'
                    ? 'Request cancelled.'
                    : confirm === 'withdraw'
                      ? 'Offer withdrawn.'
                      : 'Request rejected.'
                );
                setConfirm(null);
              }
            });
        }}
      />
    </section>
  );
}

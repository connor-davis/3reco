import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Info, MoreVertical, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { IconButton } from '@/components/icon-button';
import { OfferDialog } from '@/components/dialogs/offer-dialog';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTime } from '@/lib/format';
import { quickReplies } from '@/lib/data/requests';
import { useMock } from '@/lib/mock/hooks';
import { cn } from '@/lib/utils';
import type { MarketRequest } from '@/lib/types';
import { InvoiceCard, OfferCard } from './cards';
import { DealAside } from './deal-aside';
import { DealStepper } from './deal-stepper';
import {
  canMakeOffer,
  canRespond,
  counterpartyOf,
  iAmSeller,
  isClosed,
} from './helpers';
import { useRequestActions } from './use-request-actions';

type Confirm = 'cancel' | 'reject' | 'withdraw' | null;

/** Chat head, stepper, message stream, offer cards and the composer. */
export function Conversation({ request }: { request: MarketRequest }) {
  const { role, data } = useMock();
  const actions = useRequestActions(request);
  const [draft, setDraft] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const other = counterpartyOf(request);
  const messages = data.messages.filter(
    (message) => message.requestId === request.id
  );
  const readOnly = role !== 'business' || isClosed(request);
  const seller = iAmSeller(request);
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, like a messenger.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [request.id, messages.length, request.offerPending]);

  function submit() {
    if (!draft.trim()) return;
    actions.send(draft.trim());
    setDraft('');
  }

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
        <PersonAvatar name={other.name} online={other.online} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{other.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {other.online ? 'Online now' : 'Last seen today'} · {other.contact}
          </p>
        </div>
        {role === 'business' && canMakeOffer(request) ? (
          <Button
            size="sm"
            className="max-[780px]:hidden"
            onClick={() => setOfferOpen(true)}
          >
            Make offer
          </Button>
        ) : (
          <span className="max-[780px]:hidden">
            <StatusBadge
              status={role === 'business' ? request.status : 'View only'}
            />
          </span>
        )}
        <IconButton
          label="Request details"
          className="min-[1360px]:hidden"
          onClick={() => setInfoOpen(true)}
        >
          <Info />
        </IconButton>
        {role === 'business' && !isClosed(request) && (
          <ActionsMenu
            seller={seller}
            request={request}
            onPick={setConfirm}
            onOffer={() => setOfferOpen(true)}
          />
        )}
      </header>
      <div className="border-b bg-card px-4 py-3 sm:px-6">
        <DealStepper status={request.status} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div
          className="space-y-4 px-4 py-6 sm:px-6"
          role="log"
          aria-live="polite"
          aria-label={`Conversation with ${other.name}`}
        >
          {messages.map((message) => (
            <Bubble
              key={message.id}
              from={message.from}
              text={message.text}
              sentAt={message.sentAt}
            />
          ))}
          {request.offerPending && (
            <OfferCard
              request={request}
              canRespond={role === 'business' && canRespond(request)}
              onAccept={actions.accept}
              onDecline={actions.decline}
            />
          )}
          {['Accepted', 'Invoiced', 'Completed'].includes(request.status) && (
            <InvoiceCard request={request} />
          )}
          <div ref={bottom} />
        </div>
      </ScrollArea>
      {readOnly ? (
        <p className="border-t bg-card px-6 py-4 text-center text-sm text-muted-foreground">
          {isClosed(request)
            ? 'This request is closed.'
            : 'Staff view · Read only'}
        </p>
      ) : (
        <footer className="space-y-3 border-t bg-card px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2 max-[780px]:[&>button:nth-child(n+3)]:hidden">
            {quickReplies.map((reply) => (
              <Button
                key={reply}
                variant="outline"
                size="sm"
                onClick={() => actions.send(reply)}
              >
                {reply}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <InputGroup>
              <InputGroupAddon>
                <IconButton
                  label="Attach a file"
                  type="button"
                  onClick={() => toast('Attaching files is coming soon.')}
                >
                  <Paperclip />
                </IconButton>
              </InputGroupAddon>
              <InputGroupInput
                aria-label={`Message ${other.name}`}
                placeholder={`Message ${other.name}…`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <IconButton
                  label="Send message"
                  type="submit"
                  variant="default"
                  disabled={!draft.trim()}
                >
                  <Send />
                </IconButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </footer>
      )}
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
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirmCopy[confirm ?? 'cancel'].title}
        description={confirmCopy[confirm ?? 'cancel'].text}
        confirmLabel={confirmCopy[confirm ?? 'cancel'].label}
        onConfirm={() => {
          if (confirm) actions[confirm]();
          setConfirm(null);
        }}
      />
    </section>
  );
}

const confirmCopy = {
  cancel: {
    title: 'Cancel this request?',
    text: 'The seller will be told. You can start a new request any time.',
    label: 'Cancel request',
  },
  reject: {
    title: 'Reject this request?',
    text: 'The buyer will be told that you cannot supply this order.',
    label: 'Reject request',
  },
  withdraw: {
    title: 'Withdraw your offer?',
    text: 'The request goes back to its first step.',
    label: 'Withdraw offer',
  },
};

type MenuProps = {
  seller: boolean;
  request: MarketRequest;
  onPick: (confirm: Confirm) => void;
  onOffer: () => void;
};

function ActionsMenu({ seller, request, onPick, onOffer }: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton label="Conversation actions">
            <MoreVertical />
          </IconButton>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {canMakeOffer(request) && (
            <DropdownMenuItem className="min-[781px]:hidden" onClick={onOffer}>
              Make offer
            </DropdownMenuItem>
          )}
          {request.offerPending && seller && (
            <DropdownMenuItem onClick={() => onPick('withdraw')}>
              Withdraw my offer
            </DropdownMenuItem>
          )}
          {seller ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onPick('reject')}
            >
              Reject incoming request
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onPick('cancel')}
            >
              Cancel my outgoing request
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BubbleProps = {
  from: 'me' | 'them' | 'system';
  text: string;
  sentAt: string;
};

function Bubble({ from, text, sentAt }: BubbleProps) {
  if (from === 'system') {
    return <p className="text-center text-xs text-muted-foreground">{text}</p>;
  }

  return (
    <div
      className={cn(
        'max-w-[80%] px-4 py-3 text-sm shadow-xs',
        from === 'me'
          ? 'ml-auto rounded-[14px_3px_14px_14px] bg-outgoing'
          : 'rounded-[3px_14px_14px_14px] bg-card'
      )}
    >
      <p>{text}</p>
      <time
        dateTime={sentAt}
        className="mt-1 block text-right text-xs text-muted-foreground"
      >
        {formatTime(sentAt)}
      </time>
    </div>
  );
}

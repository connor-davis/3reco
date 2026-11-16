import { useState } from 'react';
import { MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataState } from '@/components/data-state';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateQuickReply,
  useDeleteQuickReply,
  useQuickReplies,
  useUpdateQuickReply,
} from '@/lib/api/quick-replies';

const MAX_REPLIES = 20;
const MAX_LENGTH = 500;

/**
 * Saved replies for the chat box. Tapping one hands its text to `onPick`,
 * which fills the box. It never sends anything by itself.
 */
export function QuickRepliesMenu({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  const query = useQuickReplies();
  const create = useCreateQuickReply();
  const update = useUpdateQuickReply();
  const remove = useDeleteQuickReply();
  const [open, setOpen] = useState(false);
  // 'new' is the add form; an id is the reply being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const items = query.data?.items ?? [];
  const text = draft.trim();
  const saving = create.isPending || update.isPending;

  function startEdit(id: string, body: string) {
    setEditing(id);
    setDraft(body);
  }

  function save() {
    const done = {
      onSuccess: () => setEditing(null),
      onError: (error: unknown) => toast.error(errorText(error)),
    };
    if (editing === 'new') create.mutate(text, done);
    else if (editing) update.mutate({ id: editing, body: text }, done);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        aria-label="Quick replies"
        onClick={() => setOpen(true)}
      >
        <MessageSquareText aria-hidden="true" />
        <span className="hidden sm:inline">Quick replies</span>
      </Button>
      <ResponsiveOverlay
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        title="Quick replies"
        description="Tap a reply to put it in the message box. You still tap Send."
      >
        <DataState
          query={query}
          isEmpty={!items.length && editing !== 'new'}
          icon={MessageSquareText}
          emptyTitle="No quick replies yet"
          emptyText="Save the things you type often, like 'I am on my way'."
          emptyAction={
            <Button onClick={() => startEdit('new', '')}>Add a reply</Button>
          }
        >
          <ul className="divide-y">
            {items.map((reply) =>
              editing === reply.id ? null : (
                <li key={reply.id} className="flex items-center gap-1 py-2">
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 rounded-md p-2 text-left break-words hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onPick(reply.body);
                      setOpen(false);
                    }}
                  >
                    {reply.body}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 shrink-0"
                    aria-label={`Edit reply: ${reply.body}`}
                    onClick={() => startEdit(reply.id, reply.body)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 shrink-0"
                    aria-label={`Delete reply: ${reply.body}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(reply.id, {
                        onError: (error) => toast.error(errorText(error)),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              )
            )}
          </ul>
          {editing === null && (
            <Button
              className="mt-3"
              variant="outline"
              disabled={items.length >= MAX_REPLIES}
              onClick={() => startEdit('new', '')}
            >
              {items.length >= MAX_REPLIES
                ? 'You have 20 replies. Delete one to add more.'
                : 'Add a reply'}
            </Button>
          )}
        </DataState>
        {editing !== null && (
          <div className="mt-3 space-y-2">
            <Textarea
              autoFocus
              aria-label="Reply text"
              maxLength={MAX_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button disabled={!text || saving} onClick={save}>
                Save reply
              </Button>
            </div>
          </div>
        )}
      </ResponsiveOverlay>
    </>
  );
}

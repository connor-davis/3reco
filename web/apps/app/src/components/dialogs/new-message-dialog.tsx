import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PackageSearch } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { SearchBox } from '@/components/filters';
import { SelectField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useListings } from '@/lib/api/listings';
import { useStartChat } from '@/components/chat/use-request-actions';

const schema = z.object({
  listingId: z.string().min(1, 'Choose a material to ask about.'),
});

export function NewMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Start a conversation"
      description="Choose a listed material to ask its seller about."
    >
      {open && <NewMessageForm onDone={() => onOpenChange(false)} />}
    </ResponsiveOverlay>
  );
}

function NewMessageForm({ onDone }: { onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const query = useListings({ q: search, cursor });
  const chat = useStartChat();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { listingId: '' },
  });

  return (
    <div className="space-y-4">
      <SearchBox
        label="Find a material or store"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setCursor(undefined);
          form.reset();
        }}
      />
      <DataState
        query={query}
        isEmpty={!query.data?.items.length}
        icon={PackageSearch}
        emptyTitle="No materials found"
        emptyText="Try another search."
      >
        <form
          onSubmit={form.handleSubmit(async ({ listingId }) => {
            const item = query.data?.items.find(
              (item) => item.id === listingId
            );
            if (item) {
              if (await chat.startChat(item)) onDone();
            } else
              form.setError('listingId', {
                message: 'Choose a material on this page.',
              });
          })}
          className="space-y-4"
          noValidate
        >
          <SelectField
            control={form.control}
            name="listingId"
            label="Material and store"
            options={
              query.data?.items.map((item) => ({
                value: item.id,
                label: `${item.material_name} · ${item.seller_name}`,
              })) ?? []
            }
          />
          {chat.error && (
            <p role="alert" className="text-destructive">
              {chat.error}
            </p>
          )}
          <Button type="submit" disabled={chat.isPending}>
            Start conversation
          </Button>
        </form>
      </DataState>
      <div className="flex gap-3">
        {cursor && (
          <Button
            variant="outline"
            onClick={() => {
              setCursor(undefined);
              form.reset();
            }}
          >
            First page
          </Button>
        )}
        {query.data?.has_more && (
          <Button
            variant="outline"
            onClick={() => {
              setCursor(query.data?.next_cursor ?? undefined);
              form.reset();
            }}
          >
            Next page
          </Button>
        )}
      </div>
    </div>
  );
}

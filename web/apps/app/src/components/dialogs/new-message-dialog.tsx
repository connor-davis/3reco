import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/filters';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { myStoreId, stores } from '@/lib/data/stores';
import { useMarketListings } from '@/lib/mock/hooks';
import { useStartChat } from '@/lib/mock/use-start-chat';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const options = stores
  .filter((store) => store.id !== myStoreId)
  .map((store) => ({
    value: store.id,
    label: `${store.name} · ${store.city}`,
  }));

/** "Start a conversation": pick a store, then open a request with it. */
export function NewMessageDialog({ open, onOpenChange }: Props) {
  const listings = useMarketListings();
  const startChat = useStartChat();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState(options[0].value);

  function start() {
    const lot = listings.find((listing) => listing.storeId === storeId);

    if (!lot) {
      toast('That store has nothing listed yet. Browse the market instead.');
      navigate({ to: '/market' });
    } else {
      startChat(lot);
    }

    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Start a conversation"
      description="Pick a store to message about its materials."
      footer={<Button onClick={start}>Start conversation</Button>}
    >
      <Field>
        <FieldLabel>Store</FieldLabel>
        <ChoiceSelect
          label="Store"
          value={storeId}
          options={options}
          onChange={setStoreId}
          className="w-full"
        />
      </Field>
    </ResponsiveOverlay>
  );
}

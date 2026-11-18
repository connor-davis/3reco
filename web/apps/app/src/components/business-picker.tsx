import { useState } from 'react';
import { useStores } from '@/lib/api/stores';
import { useDebounced } from '@/lib/use-debounced';
import { VerifiedMark } from '@/components/badges';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';

export type BusinessOption = {
  value: string;
  label: string;
  verified: boolean;
};
const allBusinesses: BusinessOption = {
  value: '',
  label: 'All businesses',
  verified: false,
};

/** Searchable business choice for staff record filters. */
export function BusinessPicker({
  value,
  onChange,
}: {
  value: BusinessOption | null;
  onChange: (value: BusinessOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const stores = useStores({ limit: 50, q: q || undefined });
  const options = [
    allBusinesses,
    ...(stores.data?.items ?? []).map((store) => ({
      value: store.id,
      label: store.name,
      verified: store.business_verified,
    })),
  ];
  // Keep the chosen name when searching replaces the results.
  const picked = value ?? allBusinesses;
  if (picked && !options.some((option) => option.value === picked.value)) {
    options.push(picked);
  }

  return (
    <div className="space-y-2">
      <Combobox
        items={options}
        value={picked}
        filter={null}
        onInputValueChange={(text, details) => {
          if (details.reason === 'input-change') setQuery(text);
        }}
        onValueChange={(item) => {
          onChange(item?.value ? item : null);
          setQuery('');
        }}
      >
        <ComboboxInput
          aria-label="Business"
          placeholder="All businesses"
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>No matching businesses.</ComboboxEmpty>
          <ComboboxList>
            {(item: BusinessOption) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
                <VerifiedMark verified={item.verified} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {q &&
        !stores.isFetching &&
        !stores.isError &&
        !stores.data?.items.length && (
          <p role="status" className="text-sm text-muted-foreground">
            No matching businesses.
          </p>
        )}
      {stores.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading businesses…
        </p>
      )}
      {stores.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load businesses. Try searching again.
        </p>
      )}
    </div>
  );
}

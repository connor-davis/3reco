import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChoiceSelect } from '@/components/filters';
import { Input } from '@/components/ui/input';
import { useDistanceStatus } from '@/lib/api/listings';
import { useMaterialCatalog } from '@/lib/api/materials';
import {
  DISTANCES,
  priceRangeError,
  validPrice,
  type MarketSearch,
} from './market-search';

const ANY = 'any';

/** A price box. It writes to the URL only once the text is a whole amount. */
function PriceField({
  label,
  value = '',
  onCommit,
}: {
  label: string;
  value?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Follow the URL when it changes under us (back button, a shared link).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={label}
      placeholder={label}
      aria-invalid={!validPrice(draft)}
      className="w-36 shrink-0"
      value={draft}
      onChange={(event) => {
        const next = event.target.value.trim();
        setDraft(next);
        if (validPrice(next)) onCommit(next);
      }}
    />
  );
}

/** Material, price and distance filters, then the page-local sort. */
export function MarketFilters({
  search,
  sort,
  onSort,
  onChange,
}: {
  search: MarketSearch;
  sort: string;
  onSort: (sort: string) => void;
  onChange: (change: Partial<MarketSearch>) => void;
}) {
  const materials = useMaterialCatalog();
  const distance = useDistanceStatus();
  const rangeError = priceRangeError(search.min_price, search.max_price);

  return (
    <>
      <ChoiceSelect
        label="Material"
        value={search.material_id ?? ANY}
        onChange={(value) =>
          onChange({ material_id: value === ANY ? undefined : value })
        }
        options={[
          { value: ANY, label: 'All materials' },
          ...(materials.data ?? []).map((item) => ({
            value: item.id,
            label: item.name,
          })),
        ]}
      />
      <PriceField
        label="Lowest R / kg"
        value={search.min_price}
        onCommit={(value) => onChange({ min_price: value || undefined })}
      />
      <PriceField
        label="Highest R / kg"
        value={search.max_price}
        onCommit={(value) => onChange({ max_price: value || undefined })}
      />
      {distance.data?.enabled && distance.data.has_origin && (
        <ChoiceSelect
          label="Distance"
          value={String(search.max_km ?? ANY)}
          onChange={(value) =>
            onChange({ max_km: value === ANY ? undefined : Number(value) })
          }
          options={[
            { value: ANY, label: 'Any distance' },
            ...DISTANCES.map((km) => ({
              value: String(km),
              label: `Within ${km} km`,
            })),
          ]}
        />
      )}
      <ChoiceSelect
        label="Sort this page"
        value={sort}
        onChange={onSort}
        options={[
          { value: 'newest', label: 'Newest first' },
          { value: 'price', label: 'Price: low to high' },
          { value: 'available', label: 'Most available' },
        ]}
      />
      {rangeError && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {rangeError}
        </p>
      )}
      {distance.data && !distance.data.enabled && (
        <p className="basis-full text-sm text-muted-foreground">
          Distance search is not available yet.
        </p>
      )}
      {distance.data?.enabled && !distance.data.has_origin && (
        <p className="basis-full text-sm text-muted-foreground">
          To search by distance,{' '}
          <Link className="underline" to="/business">
            add your business address
          </Link>
          .
        </p>
      )}
    </>
  );
}
